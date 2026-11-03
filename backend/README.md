# Bilheteria

API de venda de ingressos em NestJS + Prisma (PostgreSQL), com autenticação via [Better Auth](https://www.better-auth.com/) (login com Google e Facebook).

## Arquitetura

Cada módulo segue arquitetura hexagonal (ports & adapters). O domínio e a aplicação não conhecem Nest HTTP, Prisma nem Better Auth; esses detalhes ficam nos adapters.

```
src/
├── instrumentation.ts         # OpenTelemetry SDK, carregado antes do app (node --import)
├── main.ts
├── app.module.ts
├── generated/prisma/          # client gerado pelo Prisma (não editar, não versionado)
└── modules/
    ├── prisma/                # PrismaService compartilhado entre módulos
    ├── observability/         # logger (pino), Meter/Tracer do OTel e a porta TRACING
    └── <modulo>/
        ├── <modulo>.module.ts         # liga portas às implementações (DI)
        ├── core/
        │   └── entities/              # entidades e value objects do domínio
        ├── application/
        │   ├── ports/
        │   │   ├── inbound/services/      # interfaces dos casos de uso (o que o módulo oferece)
        │   │   └── outbound/              # interfaces do que o módulo precisa
        │   │       ├── repositories/      # acesso a banco
        │   │       ├── metrics/           # métricas de negócio em termos do domínio
        │   │       └── ...                # outras dependências externas (crypto, gateways)
        │   └── services/              # implementação dos casos de uso (implements porta inbound)
        └── adapters/
            ├── dto/                   # DTOs de entrada validados com class-validator
            ├── inbound/controllers/   # controllers HTTP: chamam as portas inbound
            └── outbound/
                ├── repositories/      # implementação das portas outbound com Prisma
                ├── metrics/           # implementação das portas de métricas com OpenTelemetry
                └── ...                # outras integrações (auth, crypto, gateways)
```

### Regras de dependência

```
adapters/inbound  ──►  application/ports/inbound  ◄──  application/services  ──►  application/ports/outbound  ◄──  adapters/outbound
                                                              │
                                                              ▼
                                                            core
```

- `core` não importa nada de fora dele.
- `application/services` depende apenas de `core` e das interfaces em `application/ports`, nunca de `adapters`.
- Controllers e outros módulos consomem a **porta inbound**, nunca a classe concreta do service.
- Repositórios e integrações externas implementam uma **porta outbound**.

### Portas e injeção de dependência

Interface do TypeScript não existe em runtime, então cada porta exporta um token (`Symbol`) junto da interface:

```ts
// application/ports/inbound/services/user.service.port.ts
export const USER_SERVICE = Symbol('USER_SERVICE');

export interface UserServicePort {
    registerCpf(userId: string, rawCpf: string): Promise<void>;
    hasCpf(userId: string): Promise<boolean>;
}
```

O módulo liga o token à implementação e exporta só o token:

```ts
// users.module.ts
providers: [
  {provide: USER_SERVICE, useClass: UserService},
  {provide: USER_REPOSITORY, useClass: UserRepository},
],
exports: [USER_SERVICE],
```

E quem consome injeta pela interface:

```ts
constructor(@Inject(USER_SERVICE) private readonly userService: UserServicePort) {}
```

Para usar um módulo dentro de outro (ex.: `ticket` usando `users`), importe o módulo e injete a porta inbound exportada por ele.

### Criando um módulo novo

1. `core/entities/` com as entidades do domínio.
2. Portas em `application/ports/inbound/services/` e `application/ports/outbound/repositories/` (interface + token).
3. Service em `application/services/` implementando a porta inbound e recebendo as outbound via `@Inject(TOKEN)`.
4. Repositório em `adapters/outbound/repositories/` implementando a porta outbound.
5. DTOs em `adapters/dto/` e controller em `adapters/inbound/controllers/` injetando a porta inbound.
6. `<modulo>.module.ts` com os `{provide, useClass}` e registrar o módulo em `app.module.ts`.

## Módulos

### users

- Autenticação feita pelo Better Auth em `adapters/outbound/auth/better-auth.ts`, montado via `@thallesp/nestjs-better-auth`. As rotas de login ficam em `/api/auth/*` (ex.: callback `/api/auth/callback/google`).
- **Todas as rotas exigem sessão por padrão.** Rotas públicas usam `@AllowAnonymous()`; o usuário logado é obtido com `@Session() session: UserSession`.
- O `main.ts` usa `bodyParser: false` porque o Better Auth precisa do body cru; o `AuthModule` re-adiciona os parsers nas outras rotas.
- Contas Google e Facebook com o mesmo e-mail são vinculadas ao mesmo usuário.
- `role` (`USER`, `ADMIN`, `ORGANIZER`) começa como `USER` e não pode ser enviada pelo cliente. `ORGANIZER` é obtido via `PATCH /users/me/organizer`; `ADMIN` só é atribuído direto no banco.
- **CPF**: guardado em `users.cpf_hash` como HMAC-SHA256 com `CPF_HASH_SECRET` (determinístico para garantir CPF único por conta). Cadastrado uma única vez via `PATCH /users/me/cpf` e nunca alterado; não sai na sessão.

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `/users/me` | sim | usuário da sessão |
| PATCH | `/users/me/cpf` | sim | cadastra o CPF (uma vez) |
| PATCH | `/users/me/organizer` | sim | vira `ORGANIZER` (sem restrições por enquanto) |

### event

- Evento criado por `ORGANIZER` ou `ADMIN` (`@Roles`); o organizador é o usuário da sessão.
- Ao criar, os `capacity` ingressos do evento são gerados na mesma transação.
- Listagem mostra só eventos futuros e não excluídos (`deleted_at`).

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| POST | `/events` | `ORGANIZER`/`ADMIN` | `{ name, description?, location, starts_at, capacity }` |
| GET | `/events` | não | próximos eventos |
| GET | `/events/:id` | não | detalhe do evento |

### ticket

- Ticket pertence a um evento (`ticket.event_id`) e a um usuário (`ticket.user_id`).
- Reserva exige CPF cadastrado e evento que ainda não começou.
- **Limite de 2 ingressos por usuário por evento** (como o CPF é único por conta, equivale a 2 por CPF). Contam ingressos pagos e reservas ainda válidas; reserva expirada não conta.
- O limite é garantido em uma transação que trava a linha do usuário (`SELECT ... FOR UPDATE`), então requisições simultâneas do mesmo usuário não furam o limite. A escolha do ingresso usa `FOR UPDATE SKIP LOCKED` para usuários diferentes não disputarem a mesma linha.
- Reserva expira em 5 minutos sem pagamento; depois disso o ingresso volta a ficar disponível.
- Constantes da regra em `ticket/core/entities/reservation.entity.ts`.

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `/status/:id` | não | total / disponíveis / reservados do evento |
| POST | `/reservation` | sim | `{ event_id }` reserva um ingresso |
| POST | `/webhook/ticket/payment` | não | `{ id, user_id }` confirma pagamento (gateway) |

Dependências entre módulos: `ticket` usa as portas inbound de `users` (`USER_SERVICE`) e `event` (`EVENT_SERVICE`).

## Busca (Elasticsearch)

O índice é alimentado por CDC (Sequin lendo o WAL do Postgres; infra e operação no [README da raiz](../README.md#busca-elasticsearch--sequin)). A API só **lê** do Elasticsearch; ela nunca escreve no índice. Reserva, limite por usuário, pagamento e `GET /status/:id` continuam 100% no Postgres.

### Peças no código

```
src/modules/
├── search/                                   # infraestrutura compartilhada (papel do PrismaModule para o ES)
│   ├── search.module.ts                      # provider ELASTICSEARCH_CLIENT (fecha o client no shutdown)
│   ├── elasticsearch.client.ts               # Client do @elastic/elasticsearch 8.x (não conecta no construtor)
│   ├── search-indices.ts                     # aliases lidos pela API: events, tickets
│   ├── search-availability.ts                # falha de infraestrutura do ES -> 503
│   └── query-transformers.ts                 # @Transform de query string (trim, "true"/"false")
├── event/
│   ├── core/entities/event-search.entity.ts              # critérios, resultado, limites (página, q, sugestões)
│   ├── application/ports/inbound/services/event-search.service.port.ts        # EVENT_SEARCH_SERVICE
│   ├── application/ports/inbound/services/event-availability.service.port.ts  # EVENT_AVAILABILITY_SERVICE
│   ├── application/ports/outbound/search/event-search.port.ts                 # EVENT_SEARCH
│   ├── application/services/event-search.service.ts | event-availability.service.ts
│   ├── adapters/outbound/search/elasticsearch-event-search.ts   # monta as queries do ES
│   ├── adapters/inbound/controllers/event-search.controller.ts  # /events/search, /events/suggest
│   └── adapters/inbound/schedulers/available-tickets.scheduler.ts  # job de disponibilidade
└── ticket/
    ├── core/entities/ticket-search.entity.ts             # status available|reserved|paid|expired
    ├── application/ports/{inbound,outbound}/...          # TICKET_SEARCH_SERVICE, TICKET_SEARCH
    ├── application/services/ticket-search.service.ts     # escopo ADMIN x ORGANIZER
    └── adapters/{dto,inbound/controllers,outbound/search}/...
```

Mesmas regras de dependência do resto: o service conhece só a porta `EVENT_SEARCH`/`TICKET_SEARCH`; o `@elastic/elasticsearch` aparece apenas nos adapters e no módulo `search`. O `EventSearchController` é registrado **antes** do `EventController` (ordem em `event.module.ts`), senão `/events/search` cairia em `/events/:id`; o e2e cobre isso.

### Endpoints

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `/events/search?q=&location=&from=&to=&available=true&page=&size=` | não | busca textual + filtros; `{ items, total, page, size, facets: { locations: [{ value, count }] } }` |
| GET | `/events/suggest?q=` | não | autocomplete, até 8 `{ id, name, location, starts_at }` |
| GET | `/tickets/search?event_id=&status=&page=&size=` | `ADMIN`/`ORGANIZER` | ingressos: `{ items: [{ id, event_id, user_id, status, reserved_at, is_paid }], total, page, size }` |

- **`/events/search`**: `multi_match` com `fuzziness: AUTO` em `name^3`, `name_stemmed^3`, `location^2`, `description` (analisador pt-BR: minúsculas, sem acento, stemming); sem `q`, ordena por data. Sempre só eventos futuros e não excluídos. `location` é o valor exato de uma faceta (filtro como `post_filter`, para a faceta continuar mostrando os outros locais). `available=true` filtra `available_tickets > 0`. `q`/`location` até 100 caracteres; `page` 1–200; `size` 1–50 (padrão 12). `from > to` é 400.
- **`/events/suggest`**: `bool_prefix` no campo `search_as_you_type` (`name`, `name._2gram`, `name._3gram`), com os mesmos filtros de visibilidade.
- **`/tickets/search`**: `ADMIN` vê tudo. `ORGANIZER` só vê ingressos dos próprios eventos: os ids vêm do **Postgres** (`EventServicePort.getEventIdsByOrganizer`), não do índice; pedir `event_id` de outro organizador é 403; sem eventos, volta vazio sem consultar o ES. `status`: `available` (nunca reservado), `reserved` (reserva dentro dos 5 min), `paid`, `expired` (reserva vencida, ingresso voltou a ficar à venda). `expired` é derivado na leitura, porque uma reserva vence sem nenhuma escrita no Postgres (portanto sem evento de CDC). `size` 1–100 (padrão 20).
- **ES fora do ar** (conexão recusada, timeout, 5xx, 429 ou índice inexistente): 503 `A busca está temporariamente indisponível. Tente novamente em instantes.` Erro de requisição (400) segue como 500, porque é bug. A API sobe normalmente sem ES.

### Job de disponibilidade (`event.available_tickets`)

O índice não recebe uma mensagem a cada reserva: isso geraria um UPDATE em `event` por reserva e uma tempestade de reindexações. Em vez disso:

- `event.available_tickets` (migration `20261102120100_event_available_tickets`) é um contador **aproximado**. Ele nasce igual a `capacity` no `POST /events`.
- `AvailableTicketsScheduler` (adapter inbound acionado pelo relógio, `@nestjs/schedule`) chama `EventAvailabilityService.refreshAvailableTickets()` a cada `AVAILABILITY_REFRESH_INTERVAL_MS`. O service chama `EventRepositoryPort.refreshAvailableTickets(RESERVATION_TTL_MINUTES)`, que faz **um único UPDATE em lote**: conta os disponíveis com o mesmo critério da reserva e do `/status/:id` (não pago e nunca reservado ou reserva expirada), considera só eventos futuros e não excluídos, e **só grava onde o número mudou** (`available_tickets <> c.available`). Cada linha alterada vira uma mensagem de CDC e o Sequin reindexa só aquele evento.
- Rodadas não se sobrepõem (se uma demorar mais que o intervalo, a próxima é pulada) e uma falha só gera log.
- Reservas que **expiram** também mudam a contagem sem nenhuma escrita em `ticket`: o job percebe na rodada seguinte.
- `/status/:id` continua contando os tickets no Postgres: é ele que mostra o número exato.

### Variáveis novas

| Variável | Padrão | Uso |
| --- | --- | --- |
| `ELASTICSEARCH_URL` | `http://localhost:9200` | nó do Elasticsearch (client 8.x, mesma major do servidor) |
| `ELASTICSEARCH_REQUEST_TIMEOUT_MS` | `2000` | timeout por requisição; estourou, a busca responde 503 |
| `AVAILABILITY_REFRESH_INTERVAL_MS` | `10000` | intervalo do job de disponibilidade; `0` desliga; valor inválido impede a API de subir |

### Testes

Todos os testes rodam sem Elasticsearch: o client é mockado e os testes conferem a query montada (`test/modules/*/adapters/outbound/search/`). Também cobrem o 503 por tipo de falha, os DTOs (conversão da query string e limites), o escopo ADMIN/ORGANIZER, o job (intervalo, desligado, sem sobreposição, só atualiza o que mudou) e o contrato mapping ↔ transform ↔ adapter (`test/modules/search/index-contract.spec.ts`). O e2e sobe o app com o ES numa porta fechada e confere o 503, a ordem das rotas e que o resto da API continua respondendo.

## Setup

Comandos rodados dentro de `backend/`. Para subir tudo pela raiz, veja o [README do monorepo](../README.md).

```bash
npm install
cp .env.example .env        # preencher as variáveis
docker compose -f ../docker-compose.yaml up -d   # postgres (compose fica na raiz do monorepo)
npx prisma migrate dev --config prisma7.config.ts
npm run start:dev
```

Variáveis (ver `.env.example`):

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | conexão do Postgres |
| `BETTER_AUTH_SECRET` | assinatura das sessões (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | URL pública da API |
| `FRONTEND_URL` | origem do front (CORS com cookies em todas as rotas), ex.: `http://localhost:3001` |
| `CPF_HASH_SECRET` | chave do HMAC do CPF; trocar invalida os hashes existentes |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Google |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | OAuth Facebook |
| `OTEL_*`, `LOG_LEVEL`, `NODE_ENV` | opcionais, ver [Observabilidade](#observabilidade) |

Depois de alterar `prisma/schema.prisma`, rode `npx prisma generate --config prisma7.config.ts` (ou `migrate dev`, que já gera).

## Observabilidade

Traces, métricas e logs saem do backend via OpenTelemetry (OTLP/HTTP) para o Grafana Alloy do `docker-compose.yaml` da raiz, que distribui para Tempo, Prometheus e Loki. Visão geral da stack, portas e dashboards no [README da raiz](../README.md#observabilidade).

### Como a instrumentação é carregada

`src/instrumentation.ts` inicia o `NodeSDK` e precisa rodar **antes** de qualquer import do app, para aplicar os patches em `http`, `express`, `pg` e `pino`. Por isso ele é passado ao Node com `--import` nos scripts (o build gera `dist/instrumentation.js` ao lado de `dist/main.js`):

```bash
# start:prod
node --env-file-if-exists=.env --import ./dist/instrumentation.js dist/main
# start / start:dev / start:debug: o nest start recompila e roda o dist com o mesmo node
nest start --watch --exec "node --env-file-if-exists=.env --import ./dist/instrumentation.js"
```

- `--env-file-if-exists=.env`: o SDK roda antes do `ConfigModule`, então as variáveis `OTEL_*` do `.env` precisam ser carregadas pelo próprio Node.
- O app é ESM, mas os pacotes instrumentados são CommonJS e passam pelo `require` mesmo quando importados de ESM; por isso não usamos o loader do `import-in-the-middle` (testado: só somava spans duplicados e tempo de boot). Se um dia instrumentarmos um pacote ESM puro, ele volta a ser necessário.
- Instrumentações: auto-instrumentations do OTel (http, express, pg, pino, undici, métricas de runtime do Node...) com `fs`, `dns`, `net`, `router` e `nestjs-core` desligadas (ruído, duplicadas ou sem suporte ao Nest 12) e os middlewares do express ignorados; `@prisma/instrumentation` para os spans do Prisma. O `pg` nunca coloca valores de parâmetros nos spans e a query string do callback OAuth (`code`, `state`) é mascarada.
- Resource: `service.name=bilheteria-backend`, `service.version` (do `package.json`), `service.instance.id` (UUID por processo, vira o label `instance`) e `deployment.environment` / `deployment.environment.name` (de `NODE_ENV`, default `development`).
- Shutdown: no SIGTERM/SIGINT o Nest fecha o app e o `ObservabilityModule.onApplicationShutdown` faz o flush do que está em buffer. Falha de exportação (coletor fora do ar) só gera log de diagnóstico; nunca derruba o app.
- Os testes (`vitest`) não carregam a instrumentação: a API do OTel devolve implementações no-op e os logs ficam em `silent`.

### Logs

`nestjs-pino` substitui o logger do Nest. Em dev (`NODE_ENV` diferente de `production`) sai em `pino-pretty` no terminal; em produção, JSON por linha. Cada requisição gera um log `request completed` (nível `warn` para 4xx e `error` para 5xx).

- **Correlação**: a `@opentelemetry/instrumentation-pino` injeta `trace_id`, `span_id` e `trace_flags` em toda linha emitida dentro de uma requisição.
- **Envio ao Loki**: a mesma instrumentação encaminha cada linha ao Logs SDK do OTel, que exporta via OTLP junto com traces e métricas. Escolhida em vez do `pino-opentelemetry-transport` porque reaproveita o SDK já iniciado (mesmo resource, endpoint, batching e flush no shutdown), sem um worker thread com configuração própria.
- **Redact** (`modules/observability/adapters/outbound/logging/pino-http.options.ts`): `cookie` e `authorization` da requisição, `set-cookie` da resposta e `cpf`, `cpfHash`, `password`, `secret`, `token`... em objetos logados viram `[REDACTED]` antes de sair para qualquer destino. A URL é logada sem query string.

### Métricas de negócio

Os services não conhecem OpenTelemetry: cada módulo declara uma **porta outbound de métricas** com métodos do domínio, e um adapter OTel a implementa (mesmo padrão dos repositórios).

```ts
// ticket/application/ports/outbound/metrics/ticket-metrics.port.ts
export const TICKET_METRICS = Symbol('TICKET_METRICS');

export interface TicketMetricsPort {
    reservationAttempted(outcome: ReservationOutcome, durationMs: number): void;
    paymentConfirmed(): void;
    paymentRejected(reason: PaymentRejectionReason): void;
}

// ticket.module.ts
{provide: TICKET_METRICS, useClass: OtelTicketMetrics},   // adapters/outbound/metrics/otel-ticket-metrics.ts
```

O adapter recebe o `Meter` por DI (`OTEL_METER`, exportado pelo `ObservabilityModule`), o que permite testá-lo com um `MeterProvider` em memória (`test/utils/otel.ts`). Para uma métrica nova: método na porta, implementação no adapter, chamada no service, teste do adapter e do service.

| Métrica (Prometheus) | Tipo | Labels | Significado |
| --- | --- | --- | --- |
| `bilheteria_reservations_total` | counter | `outcome` | tentativas de reserva por desfecho: `reserved`, `limit_reached`, `sold_out`, `no_cpf`, `event_started`, `event_not_found` |
| `bilheteria_reservation_duration_seconds` | histograma | `outcome` | duração da tentativa de reserva (mesmos desfechos) |
| `bilheteria_payments_confirmed_total` | counter | — | pagamentos confirmados |
| `bilheteria_payments_rejected_total` | counter | `reason` | confirmações recusadas: `expired`, `wrong_owner` |
| `bilheteria_events_created_total` | counter | — | eventos criados |

No código os instrumentos têm nomes OTel (`bilheteria.reservations`, `bilheteria.reservation.duration` em segundos...); o Alloy converte para os nomes acima. **Nunca** use id de usuário, evento ou ticket como label: cada valor distinto cria uma série nova no Prometheus. Ids vão em atributos de span.

Erro inesperado (ex.: banco fora) não conta como desfecho de negócio: aparece como 5xx nas métricas HTTP e como span com erro.

Também chegam, sem código nosso: `http_server_request_duration_seconds` (por `http_route`, método e status), pool do `pg` (`db_client_connection_*`), event loop/GC/heap do Node (`nodejs_*`, `v8js_*`) e, gerados pelo Tempo, `traces_spanmetrics_*` e `traces_service_graph_*` (com exemplars).

### Traces

Spans automáticos de HTTP, rotas do express, Better Auth, Prisma e `pg`. Span manual só onde agrega: `ticket.reserve`, com os atributos `event.id` e `outcome`, aberto pela porta `TRACING` (`modules/observability/application/ports/outbound/tracing/tracing.port.ts`) para o service continuar sem OpenTelemetry. Recusa de negócio (4xx) fica registrada como evento no span, mas não marca o span como erro.

### Variáveis

| Variável | Default | Uso |
| --- | --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | coletor OTLP/HTTP (o Alloy) |
| `OTEL_SDK_DISABLED` | `false` | `true` desliga traces, métricas e envio de logs |
| `OTEL_METRIC_EXPORT_INTERVAL` | `15000` | ms entre envios de métricas |
| `OTEL_LOG_LEVEL` | — | diagnóstico do próprio SDK (`error`, `warn`, `debug`...) |
| `OTEL_NODE_DISABLED_INSTRUMENTATIONS` | — | desliga instrumentações extras, ex.: `undici,runtime-node` |
| `LOG_LEVEL` | `info` (`silent` com `NODE_ENV=test`) | nível do pino |
| `NODE_ENV` | `development` | `production` = logs em JSON; também vira `deployment.environment` |

As demais `OTEL_*` da especificação (headers, timeouts, sampler...) também são respeitadas pelo SDK.

**Desligar**: `OTEL_SDK_DISABLED=true` no `.env` (o app sobe normalmente, só com logs no terminal) ou rodar sem o `--import` (`node dist/main`).

## Scripts

```bash
npm run start:dev    # dev com watch (já com a instrumentação)
npm run build        # build
npm run lint         # oxlint
npm run test         # testes unitários (vitest)
npm run test:e2e     # testes e2e
npm run test:load    # teste de carga (API rodando)
```

## Próximos passos

1. **Observabilidade com Grafana** — feito (ver [Observabilidade](#observabilidade)), falta só o Faro:
   - [x] OpenTelemetry no NestJS (`sdk-node`, auto-instrumentations, `@prisma/instrumentation`) e logs com `nestjs-pino` correlacionados ao trace.
   - [x] Grafana Alloy como coletor; Prometheus (métricas), Loki (logs) e Tempo (traces); `postgres_exporter`.
   - [x] Métricas de negócio: reservas por resultado, duração da reserva, pagamentos, conversão reserva → pagamento, eventos criados.
   - [x] Dashboards (API RED, negócio, Postgres, logs) e alertas (5xx, p95 do `/reservation`, conexões do Postgres).
   - [ ] **Grafana Faro no front** (erros JS e Web Vitals), enviando para o Alloy (`faro.receiver`).
   - Quando fizer sentido: cAdvisor (containers), Alertmanager com contact point e alerta de slot de replicação (depende do `wal_level=logical` do item 2).
2. **Busca com Elasticsearch + Sequin (CDC, sem Kafka)**
   - Postgres com `wal_level=logical` e publicação das tabelas; Sequin enviando mudanças direto para o Elasticsearch, com backfill.
   - Índice `events` com analisador pt-BR (sem acento, stemming), autocomplete e filtros (cidade, data, disponibilidade).
   - `available` atualizado em lote na tabela `event` (não sincronizar cada reserva); `GET /events/search`.
   - Postgres segue como fonte da verdade: reserva e limite por usuário continuam no Postgres.
3. **Pagamento com Mercado Pago**
   - Criar a cobrança na reserva, com o ticket/usuário nos metadados.
   - Webhook aceito **somente** do Mercado Pago, com validação de assinatura (`x-signature` + segredo); consultar o pagamento na API do Mercado Pago antes de confirmar.
   - Confirmação idempotente (notificação repetida de ticket já pago não pode falhar).
   - Hoje o `POST /webhook/ticket/payment` é público e sem assinatura: qualquer um com `id` + `user_id` marca o ticket como pago. Precisa ser fechado nessa etapa.

### Pendências encontradas pelos testes
- `GET /status/:id`: `reserved` inclui ingressos pagos (`total - available`).
- `TicketRepository.updateTicket`: o 404 nunca acontece (Prisma lança P2025), devolve o objeto recebido e envia `id`/`event_id` no `data`.
- Status usa `Date.now()` da aplicação e a reserva usa `NOW()` do Postgres.
- DTOs: `event_id` aceita 0/negativo, `user_id` do webhook aceita string vazia, `capacity` em string é rejeitado.
