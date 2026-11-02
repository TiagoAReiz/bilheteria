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

## Próximos passos

Observabilidade com Grafana, busca com Elasticsearch + Sequin e pagamento com Mercado Pago. Detalhes em [backend/README.md#próximos-passos](backend/README.md#próximos-passos).
