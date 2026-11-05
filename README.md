# Bilheteria

Venda de ingressos com reserva concorrente, pagamento pelo Mercado Pago (Checkout Pro), login social (Google e Facebook), limite de ingressos por CPF e imagens (capa/galeria dos eventos e avatar) num bucket S3.

| App | Stack | Porta | Docs |
| --- | --- | --- | --- |
| [`backend/`](backend) | NestJS 12, Prisma 7 (PostgreSQL), Better Auth, Vitest | 3000 | [backend/README.md](backend/README.md) |
| [`frontend/`](frontend) | Next.js 16 (App Router), Tailwind, shadcn/ui, axios, Jest | 3001 | [frontend/README.md](frontend/README.md) |

## Estrutura

```
bilheteria/
├── backend/              # API: módulos users, event, ticket, payment, storage em arquitetura hexagonal
├── frontend/             # app web: rotas (public)/(private), modules/ por página, shared/
├── infra/                # observabilidade (Alloy, Prometheus, Loki, Tempo, Grafana), busca, túnel do pagamento e S3 (LocalStack)
├── docker-compose.yaml   # infraestrutura compartilhada: Postgres + observabilidade (+ includes de infra/)
└── package.json          # atalhos para rodar os dois apps a partir da raiz
```

Cada app é independente: tem o próprio `package.json`, lockfile, `.env` e testes. A raiz só orquestra.

## Rodando local

```bash
npm run install:all          # instala backend e frontend
cp backend/.env.example backend/.env       # preencher (ver backend/README.md)
cp frontend/.env.example frontend/.env.local
npm run infra:up             # Postgres, observabilidade, busca e S3 (LocalStack)
cd backend && npx prisma migrate dev --config prisma7.config.ts && cd ..
npm run dev:backend          # http://localhost:3000
npm run dev:frontend         # http://localhost:3001 (em outro terminal)
```

## Scripts da raiz

| Script | O que faz |
| --- | --- |
| `npm run install:all` | `npm ci` nos dois apps |
| `npm run infra:up` / `infra:down` | sobe/derruba o `docker-compose.yaml` (com os `include` de busca, pagamento e storage) |
| `npm run dev:backend` / `dev:frontend` | sobe cada app em modo dev |
| `npm run build` | build dos dois |
| `npm run lint` | lint dos dois |
| `npm test` | testes unitários dos dois |
| `npm run test:e2e` | e2e do backend |

## Observabilidade

Métricas, logs e traces do backend no padrão Grafana LGTM, tudo self-hosted pelo `docker-compose.yaml`.
O backend manda tudo via OpenTelemetry (OTLP) para o **Alloy**, que distribui para Prometheus, Loki e Tempo; o Grafana lê os três e liga um sinal ao outro (métrica → trace → logs).

```
backend (OTel SDK + pino) ──OTLP :4318──► Alloy ──► Prometheus (métricas) ─┐
                                               ├──► Loki (logs) ──────────┼──► Grafana :3002
                                               └──► Tempo (traces) ───────┤
                                                      └─ span metrics ──► Prometheus
postgres-exporter ◄──scrape── Prometheus
```

| Serviço | Porta | URL | Para quê |
| --- | --- | --- | --- |
| Grafana | 3002 | http://localhost:3002 | dashboards, explore, alertas (login `admin` / `admin`, só dev) |
| Alloy | 4317 / 4318 / 12345 | http://localhost:12345 | coletor OTLP (gRPC / HTTP) e UI de debug do pipeline |
| Prometheus | 9090 | http://localhost:9090 | métricas (PromQL) e alertas em `/alerts` |
| Loki | 3100 | http://localhost:3100/ready | logs (consultar pelo Grafana) |
| Tempo | 3200 | http://localhost:3200/ready | traces (consultar pelo Grafana) |
| postgres-exporter | 9187 | http://localhost:9187/metrics | métricas do Postgres |

Como subir:

```bash
npm run infra:up       # Postgres + stack (docker compose up -d)
npm run dev:backend    # o backend já sobe com a instrumentação (node --import ./dist/instrumentation.js)
```

Abra http://localhost:3002, entre com `admin` / `admin` (o Grafana pede para trocar; dá para pular) e vá em **Dashboards → Bilheteria**:

- **API (RED)**: req/s, erros 4xx/5xx e latência p50/p95/p99 por rota, com exemplars que abrem o trace.
- **Negócio**: reservas por resultado, taxa de sucesso, conversão reserva → pagamento, p95 da reserva, eventos criados.
- **Postgres**: conexões vs `max_connections`, pool do backend, locks, transações/s, cache hit.
- **Logs**: logs do backend filtráveis por nível, com link do `trace_id` para o Tempo.

Onde ficam as configs:

| Arquivo | O que configura |
| --- | --- |
| `infra/alloy/config.alloy` | pipeline OTLP → Prometheus / Loki / Tempo |
| `infra/prometheus/prometheus.yml` | scrapes (postgres-exporter e a própria stack) e onde plugar um Alertmanager |
| `infra/prometheus/alerts.yml` | alertas (5xx > 1%, p95 do `/reservation` > 500ms, conexões > 80%); testes em `alerts.test.yml` |
| `infra/loki/loki.yaml` | Loki monolítico com retenção de 7 dias |
| `infra/tempo/tempo.yaml` | Tempo monolítico + metrics-generator (span metrics e service graph) |
| `infra/grafana/provisioning/datasources/datasources.yaml` | datasources com UID fixo e a correlação entre eles |
| `infra/grafana/provisioning/dashboards/*.json` | dashboards (edite o JSON; mudanças pela UI não são salvas) |

Os alertas são regras do Prometheus e aparecem no Grafana em **Alerting → Alert rules**, mas **não notificam ninguém**: não há Alertmanager/contact point. Para notificar, suba um Alertmanager e descomente o bloco `alerting` em `infra/prometheus/prometheus.yml`. Para testar as regras sem subir nada:

```bash
docker run --rm -v ./infra/prometheus:/p -w /p --entrypoint promtool prom/prometheus:v3.15.1 test rules alerts.test.yml
```

Instrumentação, métricas de negócio e variáveis `OTEL_*` do backend: [backend/README.md#observabilidade](backend/README.md#observabilidade).

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

## Pagamento (Mercado Pago)

O ingresso é pago no **Checkout Pro** do Mercado Pago (API de Orders): o front chama `POST /payments/checkout`, o navegador vai para a página do Mercado Pago (Pix ou cartão) e a confirmação chega pelo **webhook assinado** `POST /webhooks/mercadopago`, que consulta a order na API do Mercado Pago e marca o ingresso como pago. Regras, garantias e endpoints: [backend/README.md#payment](backend/README.md#payment).

```
navegador ──► front ──► API POST /payments/checkout ──► Mercado Pago (cria a order)
   │                                                        │
   └──────────── paga na página do Mercado Pago ◄───────────┘
                                                            │ webhook (x-signature)
Mercado Pago ──► https://<aleatório>.trycloudflare.com ──► cloudflared ──► API :3000 /webhooks/mercadopago
```

O Mercado Pago só entrega notificações numa URL pública HTTPS. Em dev, o serviço `cloudflared` ([`infra/payment/compose.payment.yaml`](infra/payment/compose.payment.yaml), profile `tunnel`) abre um *quick tunnel* do Cloudflare, sem conta, apontando para `http://host.docker.internal:3000`.

### Testando um pagamento ponta a ponta

1. **Credenciais**: em `backend/.env`, `MP_ACCESS_TOKEN` com o access token **de teste** da aplicação ([Suas integrações](https://www.mercadopago.com.br/developers/panel/app) > Credenciais de teste).
2. **Suba tudo**: `npm run infra:up`, `npx prisma migrate deploy --config prisma7.config.ts` (em `backend/`), `npm run dev:backend` e `npm run dev:frontend`.
3. **Suba o túnel e pegue a URL** (ela muda a cada subida):

   ```bash
   docker compose --profile tunnel up -d cloudflared
   curl -s localhost:20241/quicktunnel          # {"hostname":"<palavras>.trycloudflare.com"}
   # ou: docker compose logs cloudflared | grep trycloudflare.com
   ```

4. **Cadastre o webhook** no painel: Suas integrações > sua aplicação > **Webhooks > Configurar notificações** > aba **Modo de teste**, URL `https://<hostname>/webhooks/mercadopago`, evento **Order (Mercado Pago)**, Salvar. Guarde a URL em `MP_NOTIFICATION_URL` (referência) e copie a **assinatura secreta** gerada para `MP_WEBHOOK_SECRET` no `backend/.env`. Reinicie o backend: sem o segredo, todo webhook recebe 401.
5. **Confira o caminho**: no painel, **Simular notificação**. O log do backend deve mostrar a requisição com 200 (order fictícia é ignorada). 401 = segredo errado ou ausente; erro de conexão = túnel caído ou backend parado.
6. **Pague**: crie um evento com preço (perfil de organizador), reserve um ingresso, clique em **Pagar** e, na página do Mercado Pago, entre com um **comprador de teste** (painel > Contas de teste), de preferência em janela anônima. Cartão `5031 4332 1540 6351`, CVV `123`, validade `11/30`, titular `APRO` (aprovado) ou `OTHE` (recusado), CPF `12345678909`.
7. **Volte para o site**: o Mercado Pago redireciona para `/payment/success|pending|failure`. A página consulta `GET /payments/:id` a cada 3 s até o webhook confirmar; o status mostrado é o da API, não o da URL.
8. **Derrube o túnel** ao terminar: `docker compose --profile tunnel stop cloudflared`. Enquanto ele está no ar, **a API inteira** fica acessível pela URL pública (as rotas continuam exigindo sessão e o webhook exige assinatura, mas é exposição desnecessária).

Observações:

- A URL do quick tunnel muda a cada `up`: atualize o cadastro no painel (a assinatura secreta continua a mesma; dá para renová-la com "Redefinir").
- A documentação do Mercado Pago avisa que pagamentos feitos com credenciais de teste podem não disparar notificações; se a tela ficar em "Aguardando a confirmação", valide o webhook com o "Simular notificação".
- Métricas: `bilheteria_payments_{confirmed,rejected,refunded,not_approved,checkouts,webhooks_rejected}_total` no Prometheus (ver [backend/README.md#métricas-de-negócio](backend/README.md#métricas-de-negócio)).

## Armazenamento de imagens (S3 / LocalStack)

Capa e galeria (até 10 fotos) dos eventos e o avatar dos usuários ficam num bucket S3. O arquivo **não passa pela API**: o navegador envia direto ao bucket com um POST pré-assinado e a API só assina e confere. Detalhes, endpoints e regras: [backend/README.md#armazenamento-de-imagens](backend/README.md#armazenamento-de-imagens).

```
front ──POST /events/:id/cover/upload-url──► API (dono do evento? tipo ok?) ──► { url, fields, key }
  │                                           assina: chave gerada no servidor, Content-Type exato, até 5 MB
  └──POST multipart (fields + arquivo)──► bucket (LocalStack :4566)   o S3 recusa tamanho/tipo/chave fora da política
front ──PUT /events/:id/cover { key }──► API ──HEAD/GET 12 bytes──► bucket   confere tamanho, tipo e assinatura
                                           └─► grava a chave no Postgres e apaga a capa anterior
front <img src="STORAGE_PUBLIC_URL/events/1/cover/<uuid>.png">  leitura pública direto do bucket
```

Tudo fica em [`infra/storage/`](infra/storage), incluído pelo `docker-compose.yaml` da raiz:

| Serviço | Imagem | Porta | Papel |
| --- | --- | --- | --- |
| `localstack` | `localstack/localstack:4.14.0` | 4566 | S3 emulado; o hook `localstack/init-s3.sh` (ready.d, idempotente) cria o bucket `bilheteria-images`, o CORS para `http://localhost:3001` e a política de leitura pública |

- **Por que 4.14.0**: desde a 2026.03.0 a imagem do LocalStack é única e **exige `LOCALSTACK_AUTH_TOKEN`** (conta; plano Hobby gratuito só para uso não comercial). A 4.14.0 (fev/2026) é a última community que sobe sem token, e é o que está fixado. Não use `latest`/`stable`/`2026.x`. Ela não recebe mais correções; se um dia parar de servir, o MinIO (`minio/minio`) é um substituto compatível com S3 que só pede mudar as variáveis `STORAGE_*` (path-style, endpoint e credenciais) e o script de init.
- **Sem persistência**: o LocalStack community guarda tudo em memória. Recriar o container apaga as imagens (as chaves no banco ficam apontando para nada; é só reenviar). O bucket, o CORS e a política voltam sozinhos.
- **Conferir**: `curl localhost:4566/_localstack/init/ready` (o hook rodou?), `curl localhost:4566/bilheteria-images` (lista os objetos, XML) e abrir uma `cover_url` no navegador.
- **Variáveis** do backend: `STORAGE_S3_*` e `STORAGE_PUBLIC_URL` (ver [backend/README.md](backend/README.md#variáveis-do-armazenamento)). Trocar para S3 de verdade, CloudFront ou R2 é só `.env`.
- **Busca**: a capa vai para o índice `events` como `cover_key` (a URL é montada pela API). O `search-init` adiciona o campo ao índice existente (`infra/search/elasticsearch/mapping-additions/`, `PUT _mapping`, sem reindexar). Num ambiente que já existia: `docker compose run --rm search-init`, a migration (`npx prisma migrate deploy --config prisma7.config.ts`) e `docker compose restart sequin` (recarrega a transform). Eventos antigos só ganham `cover_key` no índice quando mudam (ou com o backfill do Sequin).

## Emails (Resend / Mailpit)

Emails transacionais saem pelo módulo `notification` do backend, com o padrão **outbox**: quem gera o fato grava o pedido de email na tabela `email_outbox` na **mesma transação**, e um worker (a cada 5s) envia depois, com novas tentativas.

```
webhook MP aprova ──► transação: ticket pago + payment approved + INSERT email_outbox (dedupe_key única)
worker (5s) ──► reserva lote (FOR UPDATE SKIP LOCKED + lease 5min) ──► React Email ──► provedor
                 sucesso: sent  ·  falha temporária: nova tentativa em 30s, 2min, 8min... (até 6)  ·  permanente: failed
```

- **Por que outbox**: o provedor fora do ar não derruba a confirmação do pagamento, nunca sai email de um fato que não foi gravado, e webhook repetido não duplica (a `dedupe_key`, ex. `ticket-confirmed:<paymentId>`, é única e vai como idempotency key para o provedor).
- **Emails hoje**: ingresso confirmado (pagamento aprovado), para o comprador.
- **Dev (`EMAIL_DRIVER=smtp`, padrão)**: o [`infra/email/`](infra/email) sobe o Mailpit (`axllent/mailpit:v1.31.5`). A API envia para `localhost:1025` e tudo aparece em **http://localhost:8025**; nada sai para a internet.
- **Entrega real (`EMAIL_DRIVER=resend`)**: precisa de `RESEND_API_KEY`. Plano grátis: 3.000/mês, 100/dia. **Sem domínio verificado** o remetente tem que ser `onboarding@resend.dev` e o Resend **só entrega para o email da própria conta**; para qualquer outro destinatário responde 403 e o email vira `failed` (sem novas tentativas). Para enviar a usuários reais: verificar um domínio no Resend (registros SPF/DKIM no DNS) e trocar `EMAIL_FROM`.
- **Conferir**: `SELECT kind, to_email, status, attempts, last_error FROM email_outbox ORDER BY created_at DESC;` e a métrica `bilheteria_emails_processed_total{kind, outcome}` no Prometheus.
- **Variáveis**: `EMAIL_DRIVER`, `EMAIL_FROM`, `RESEND_API_KEY`, `SMTP_HOST`/`SMTP_PORT`, `EMAIL_DISPATCH_INTERVAL_MS` (ver `backend/.env.example`).

## Próximos passos

Busca com Elasticsearch + Sequin, pagamento com Mercado Pago, imagens no S3 e o email de ingresso confirmado estão feitos. Falta o Faro no front (observabilidade do navegador) e, no pagamento, preço por setor e reconciliação periódica. Detalhes em [backend/README.md#próximos-passos](backend/README.md#próximos-passos).
