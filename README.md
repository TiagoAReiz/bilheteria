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
├── infra/                # configs da stack de observabilidade (Alloy, Prometheus, Loki, Tempo, Grafana)
├── docker-compose.yaml   # infraestrutura compartilhada: Postgres + observabilidade
└── package.json          # atalhos para rodar os dois apps a partir da raiz
```

Cada app é independente: tem o próprio `package.json`, lockfile, `.env` e testes. A raiz só orquestra.

## Rodando local

```bash
npm run install:all          # instala backend e frontend
cp backend/.env.example backend/.env       # preencher (ver backend/README.md)
cp frontend/.env.example frontend/.env.local
npm run infra:up             # Postgres + stack de observabilidade
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

## Próximos passos

Faro no front (observabilidade do navegador), busca com Elasticsearch + Sequin e pagamento com Mercado Pago. Detalhes em [backend/README.md#próximos-passos](backend/README.md#próximos-passos).
