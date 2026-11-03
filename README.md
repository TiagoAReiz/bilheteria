# Bilheteria

Venda de ingressos com reserva concorrente, login social (Google e Facebook) e limite de ingressos por CPF.

| App | Stack | Porta | Docs |
| --- | --- | --- | --- |
| [`backend/`](backend) | NestJS 12, Prisma 7 (PostgreSQL), Better Auth, Vitest | 3000 | [backend/README.md](backend/README.md) |
| [`frontend/`](frontend) | Next.js 16 (App Router), Tailwind, shadcn/ui, axios, Jest | 3001 | [frontend/README.md](frontend/README.md) |

## Estrutura

```
bilheteria/
├── backend/              # API: módulos users, event, ticket em arquitetura hexagonal
├── frontend/             # app web: rotas (public)/(private), modules/ por página, shared/
├── docker-compose.yaml   # infraestrutura compartilhada (Postgres; depois Grafana, Elasticsearch...)
└── package.json          # atalhos para rodar os dois apps a partir da raiz
```

Cada app é independente: tem o próprio `package.json`, lockfile, `.env` e testes. A raiz só orquestra.

## Rodando local

```bash
npm run install:all          # instala backend e frontend
cp backend/.env.example backend/.env       # preencher (ver backend/README.md)
cp frontend/.env.example frontend/.env.local
npm run infra:up             # Postgres
cd backend && npx prisma migrate dev --config prisma7.config.ts && cd ..
npm run dev:backend          # http://localhost:3000
npm run dev:frontend         # http://localhost:3001 (em outro terminal)
```

## Scripts da raiz

| Script | O que faz |
| --- | --- |
| `npm run install:all` | `npm ci` nos dois apps |
| `npm run infra:up` / `infra:down` | sobe/derruba o `docker-compose.yaml` |
| `npm run dev:backend` / `dev:frontend` | sobe cada app em modo dev |
| `npm run build` | build dos dois |
| `npm run lint` | lint dos dois |
| `npm test` | testes unitários dos dois |
| `npm run test:e2e` | e2e do backend |

## Busca (Elasticsearch + Sequin)

A busca de eventos (e a consulta operacional de ingressos) lê de um Elasticsearch alimentado por **CDC**: o [Sequin](https://sequinstream.com/docs) lê o WAL lógico do Postgres e escreve no Elasticsearch, sem Kafka e sem a API precisar "lembrar" de indexar. **O Postgres continua sendo a fonte da verdade**: reserva, limite por usuário, pagamento e o `GET /status/:id` nunca dependem do Elasticsearch. Se ele cair, só as rotas de busca respondem 503.

```
API ──escreve──► Postgres (db) ──WAL lógico──► Sequin ──bulk index/delete──► Elasticsearch
                   ▲  publication bilheteria_search            (transform)        aliases events / tickets
                   │  slot bilheteria_search                                         ▲
front ──► API ─────┴── /events, /events/:id, /status/:id      /events/search ───────┘
                                                             /events/suggest, /tickets/search
```

Tudo fica em [`infra/search/`](infra/search), incluído pelo `docker-compose.yaml` da raiz:

| Serviço | Imagem | Porta (host) | Papel |
| --- | --- | --- | --- |
| `db` (já existia) | `postgres` | 5432 | agora com `wal_level=logical` e `max_slot_wal_keep_size=2GB` |
| `elasticsearch` | `elasticsearch:8.19.23` | 9200 | single-node, security **desligada (só dev)**, heap 512 MB, volume `elasticsearch_data` |
| `search-init` | `curlimages/curl:8.22.0` | – | aplica os templates de `infra/search/elasticsearch/` e cria `events_v1`/`tickets_v1` atrás dos aliases `events`/`tickets`; roda e sai |
| `sequin` | `sequin/sequin:v0.14.6` | 7376 (console/API), 8376 só na rede (`/metrics`) | CDC configurado como código em `infra/search/sequin/sequin.yaml` |
| `sequin-postgres` | `postgres:17.11-alpine` | – | estado interno do Sequin (não é o banco da aplicação) |
| `sequin-redis` | `redis:7.4.12-alpine` | – | estado interno do Sequin (persistente, AOF) |
| `kibana` (profile `debug`) | `kibana:8.19.23` | 5601 | opcional, para explorar os índices |

### Subindo

```bash
npm run infra:up      # db, elasticsearch, search-init, sequin (+ postgres/redis do sequin)
cd backend && npx prisma migrate deploy --config prisma7.config.ts && cd ..   # ou migrate dev
```

- A migration `20261102120200_search_cdc_publication` cria a **publication** `bilheteria_search` (só `event` e `ticket`) e põe `event` em `REPLICA IDENTITY FULL`. Até ela rodar, o Sequin não encontra a publication e reinicia sozinho (`restart: unless-stopped`); depois disso ele cria o **replication slot** `bilheteria_search` e faz o **backfill inicial** dos dois sinks.
- Banco que já existia: `npm run infra:up` recria o container `db` com o `wal_level` novo (o volume anônimo é preservado). Se o banco foi montado com `db push`, veja o comentário da migration `20261102120000_sync_schema` (marcar como aplicada com `prisma migrate resolve`).
- Na API: `ELASTICSEARCH_URL=http://localhost:9200` (padrão) e o job `AVAILABILITY_REFRESH_INTERVAL_MS` (ver [backend/README.md#busca](backend/README.md#busca-elasticsearch)).

### Inspecionando

```bash
# índices, aliases e documentos
curl 'localhost:9200/_cat/indices/events*,tickets*?v'
curl 'localhost:9200/_cat/aliases/events,tickets?v'
curl 'localhost:9200/events/_search?pretty&q=name:rock'
curl 'localhost:9200/events/_doc/1?pretty'          # _id = id da linha no Postgres

# slot de replicação: ativo? quanto WAL está retido?
docker compose exec db psql -U postgres -c "select slot_name, active, wal_status, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) as retido from pg_replication_slots;"

# a API
curl 'localhost:3000/events/search?q=rock&available=true&page=1&size=12'
curl 'localhost:3000/events/suggest?q=fes'
```

- Console do Sequin: <http://localhost:7376> (`admin@bilheteria.local` / `sequinpassword!`, só dev): saúde do banco/slot, mensagens com erro por sink, backfills.
- Kibana: `docker compose --profile debug up -d kibana` e <http://localhost:5601>.

### Backfill e reindexação

- **Reprocessar tudo** (ex.: índice apagado, transform corrigida): dispare um backfill pela Management API do Sequin. Ele reenvia cada linha atual como `read`; como o `_id` é o id da linha, reindexar é idempotente.

  ```bash
  curl -X POST localhost:7376/api/sinks/events-to-elasticsearch/backfills -H 'Authorization: Bearer bilheteria-dev-token'
  curl -X POST localhost:7376/api/sinks/tickets-to-elasticsearch/backfills -H 'Authorization: Bearer bilheteria-dev-token'
  ```

- **Mudança de mapping** (campo novo, analisador diferente): mapping de índice existente não muda, então troca-se o índice físico atrás do alias, sem tocar em código nem no `sequin.yaml`:
  1. edite o template em `infra/search/elasticsearch/index-templates/` (suba o `_meta.version`), a transform em `infra/search/sequin/transforms/` se o documento mudou, e rode `docker compose run --rm search-init` (reaplica os templates);
  2. `curl -X PUT localhost:9200/events_v2` (o template `events_v*` se aplica);
  3. troque o alias de uma vez: `curl -X POST localhost:9200/_aliases -H 'Content-Type: application/json' -d '{"actions":[{"remove":{"index":"events_v1","alias":"events"}},{"add":{"index":"events_v2","alias":"events","is_write_index":true}}]}'`;
  4. dispare o backfill do sink (acima) para popular o `events_v2`; durante o backfill a busca fica incompleta (em dev é aceitável; sem downtime seria `_reindex` v1→v2 antes do passo 3);
  5. `curl -X DELETE localhost:9200/events_v1`.

  O teste `backend/test/modules/search/index-contract.spec.ts` falha se mapping e transform divergirem.

### Riscos e o que monitorar

- **WAL retido pelo slot**: com o Sequin parado, o Postgres guarda todo o WAL desde a última confirmação. `max_slot_wal_keep_size=2GB` limita o estrago, mas quando estoura o slot é **invalidado** (`wal_status = lost`) e é preciso recriá-lo e fazer backfill. Monitore o "retido" da query acima (alerta acima de ~1 GB) e `sequin_entity_health` no `/metrics` do Sequin.
- **Remover a busca**: o slot sobrevive ao Sequin. Ao desligar de vez: `select pg_drop_replication_slot('bilheteria_search');` (e `drop publication bilheteria_search;`).
- **Consistência eventual**: o índice fica atrás do Postgres por alguns segundos (CDC) e o `available_tickets` por até `AVAILABILITY_REFRESH_INTERVAL_MS` + CDC. A busca mostra "Ingressos disponíveis/Esgotado"; o número exato está em `/status/:id`.
- **Mudança de schema**: coluna nova em `event`/`ticket` não aparece no índice até a transform e o template incluírem o campo (os mappings são `dynamic: strict`: um campo inesperado vira erro visível no console do Sequin, não lixo no índice). Renomear/remover coluna usada pela transform quebra o sink: altere a transform junto com a migration.
- **Sequin v0.14.6**: é a versão mais recente publicada (fev/2026); não houve releases depois disso. Vale acompanhar o status do projeto antes de ir para produção.

## Próximos passos

Observabilidade com Grafana, busca com Elasticsearch + Sequin e pagamento com Mercado Pago. Detalhes em [backend/README.md#próximos-passos](backend/README.md#próximos-passos).
