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
- **Avatar**: `users.image` continua sendo a foto do Google/Facebook (Better Auth). O avatar enviado fica em `users.avatar_key` (campo do Better Auth com `input: false`: o `/api/auth/update-user` recusa com `FIELD_NOT_ALLOWED`). O plugin `customSession` acrescenta `avatarUrl` (enviado ?? `image`) ao `user` da sessão: o front lê de `/api/auth/get-session` e o `GET /users/me` devolve o mesmo. Upload: ver [Armazenamento de imagens](#armazenamento-de-imagens).

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `/users/me` | sim | usuário da sessão (com `avatarUrl` e `avatarKey`) + `hasCpf` (só o booleano; o hash nunca sai) |
| PATCH | `/users/me/cpf` | sim | cadastra o CPF (uma vez) |
| PATCH | `/users/me/organizer` | sim | vira `ORGANIZER` (sem restrições por enquanto) |
| POST | `/users/me/avatar/upload-url` | sim | `{ content_type }` → POST pré-assinado `{ url, fields, key, max_bytes, expires_at }` |
| PUT | `/users/me/avatar` | sim | `{ key }` confere no bucket, troca o avatar e apaga o anterior → `{ avatar_url }` |
| DELETE | `/users/me/avatar` | sim | volta para a foto do provedor → `{ avatar_url }` (null = sem foto) |

### event

- Evento criado por `ORGANIZER` ou `ADMIN` (`@Roles`); o organizador é o usuário da sessão.
- Ao criar, os `capacity` ingressos do evento são gerados na mesma transação.
- Listagem mostra só eventos futuros e não excluídos (`deleted_at`).
- `price_cents`: preço único do ingresso em centavos de BRL, obrigatório, inteiro de 100 (R$ 1,00) a 10.000.000 (R$ 100.000,00). Eventos anteriores ao pagamento têm `null` (sem venda; ver [payment](#payment)).
- `max_tickets_per_cpf`: quantos ingressos ativos um mesmo CPF pode ter no evento, obrigatório, inteiro de 1 a 10 e no máximo `capacity` (CHECK `event_max_tickets_per_cpf_range` no banco).
- **Edição** (`PATCH /events/:id`): só o organizador dono ou um `ADMIN`, e só antes do evento começar (409 depois). A **capacidade e o limite por CPF só aumentam** (409 se diminuírem): diminuir a capacidade apagaria ingressos que podem estar reservados ou pagos, e a escolha do limite por CPF é irreversível para baixo (quem comprou contando com ele nunca fica acima). O limite continua <= capacidade. As regras rodam com a linha do evento travada (`FOR UPDATE`); aumentar a capacidade cria os ingressos novos e soma em `available_tickets` na mesma transação. Mudar o preço não altera checkouts já abertos (a order guarda o valor da hora em que foi criada).

- **Imagens**: uma capa (`event.cover_key`) e uma galeria de até 10 fotos (`event_photo`, ordenadas por `position`). Só o organizador que criou o evento ou um `ADMIN` mexem (403 para os demais, 404 para evento inexistente/excluído). As respostas trazem `cover_url` (e `photos` no detalhe), nunca a chave. Fluxo e regras em [Armazenamento de imagens](#armazenamento-de-imagens).

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| POST | `/events` | `ORGANIZER`/`ADMIN` | `{ name, description?, location, starts_at, capacity, price_cents, max_tickets_per_cpf }` |
| PATCH | `/events/:id` | dono do evento ou `ADMIN` | edita `{ name?, description?, location?, starts_at?, capacity?, price_cents?, max_tickets_per_cpf? }` (só os enviados mudam; `description: null` apaga) |
| GET | `/events` | não | próximos eventos (com `cover_url`) |
| GET | `/events/:id` | não | detalhe do evento com `cover_url` e `photos: [{ id, url, position }]` em ordem |
| POST | `/events/:id/cover/upload-url` | dono/`ADMIN` | `{ content_type }` → POST pré-assinado |
| PUT | `/events/:id/cover` | dono/`ADMIN` | `{ key }` confirma e troca a capa (apaga a anterior) → `{ cover_url }` |
| DELETE | `/events/:id/cover` | dono/`ADMIN` | remove a capa (204) |
| POST | `/events/:id/photos/upload-url` | dono/`ADMIN` | `{ content_type }` → POST pré-assinado; 409 se a galeria já tem 10 |
| POST | `/events/:id/photos` | dono/`ADMIN` | `{ key }` confirma e adiciona no fim → `{ photos }`; 409 se lotou |
| PATCH | `/events/:id/photos/order` | dono/`ADMIN` | `{ photo_ids }` (todas as fotos, na nova ordem) → `{ photos }`; 400 se não for exatamente a galeria |
| DELETE | `/events/:id/photos/:photoId` | dono/`ADMIN` | remove a foto e o objeto (204) |

### ticket

- Ticket pertence a um evento (`ticket.event_id`) e a um usuário (`ticket.user_id`).
- Reserva exige CPF cadastrado e evento que ainda não começou.
- **Limite de ingressos por CPF definido pelo organizador** (`max_tickets_per_cpf`, 1 a 10 e no máximo a capacidade; obrigatório no `POST /events`; eventos anteriores ficaram com 2). Como o CPF é único por conta, o limite é por usuário. Contam ingressos pagos e reservas ainda válidas; reserva expirada não conta. Sem CPF a reserva responde 403 e o front abre um modal para cadastrar o CPF e continua a reserva.
- O limite é garantido em uma transação que trava a linha do usuário (`SELECT ... FOR UPDATE`), então requisições simultâneas do mesmo usuário não furam o limite. A escolha do ingresso usa `FOR UPDATE SKIP LOCKED` para usuários diferentes não disputarem a mesma linha.
- Reserva expira em 5 minutos sem pagamento; depois disso o ingresso volta a ficar disponível.
- Constantes da regra em `ticket/core/entities/reservation.entity.ts`.

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `/status/:id` | não | total / disponíveis / reservados do evento |
| POST | `/reservation` | sim | `{ event_id }` reserva um ingresso |

Dependências entre módulos: `ticket` usa as portas inbound de `users` (`USER_SERVICE`) e `event` (`EVENT_SERVICE`).

O pagamento (e a marcação de `is_paid`) é do módulo [payment](#payment); o antigo `POST /webhook/ticket/payment`, público e sem assinatura, foi removido.

### payment

Pagamento do ingresso com o **Checkout Pro do Mercado Pago, pela API de Orders** (a de Preferences está sendo descontinuada). O comprador paga na página do Mercado Pago (Pix ou cartão); nenhum dado de cartão passa pela nossa API. O preço é **único por evento** (`event.price_cents`, em centavos de BRL), definido pelo organizador no `POST /events`.

```
 front                   API (módulo payment)                                    Mercado Pago
   │ POST /reservation ──► ticket.reserved_at = NOW()   (vale 5 min)                  │
   │ POST /payments/checkout {ticket_id}                                              │
   │ ──────────────────► openCheckout: FOR UPDATE no ticket; valida dono/reserva/preço│
   │                     reaproveita o pendente da mesma reserva ou cria `pending`    │
   │                     POST /v1/orders  external_reference = payment.id ──────────► │
   │                       expiration_time = fim da reserva, X-Idempotency-Key        │
   │ ◄── { payment_id, checkout_url, expires_at }                                     │
   │ ────────────── navegador vai para checkout_url ─────────────────────────────────►│ paga (Pix/cartão)
   │                     POST /webhooks/mercadopago?data.id=ORD…&type=order ◄──────── │ x-signature
   │                     1. assinatura HMAC (401 se inválida)                         │
   │                     2. GET /v1/orders/{id}  (nunca confia no corpo) ───────────► │
   │                     3. FOR UPDATE ticket → payment; reserva ainda válida?        │
   │                        sim: ticket.is_paid + payment.approved (1 transação)      │
   │                        não: POST /v1/orders/{id}/refund ───────────────────────► │ estorno
   │                     4. 200 (503 se o Mercado Pago falhar: ele reenvia)           │
   │ ◄─── /payment/success|pending|failure?payment_id=… ──────────────────────────────│
   │ GET /payments/:id (a cada 3 s enquanto pending) ──► status real (do webhook)     │
```

Peças no código (mesmo padrão hexagonal dos outros módulos):

| Peça | Arquivo | Papel |
| --- | --- | --- |
| regras | `core/entities/payment-rules.ts` | funções puras: pode abrir checkout? reaproveita? confirma ou estorna? |
| `PAYMENT_SERVICE` | `application/services/payment.service.ts` | casos de uso; não conhece o Mercado Pago |
| `PAYMENT_GATEWAY` | `adapters/outbound/gateways/mercadopago.gateway.ts` | API de Orders com `fetch` nativo (criar, consultar, estornar) |
| `PAYMENT_REPOSITORY` | `adapters/outbound/repositories/payment.repository.ts` | transações com `SELECT ... FOR UPDATE` |
| `PAYMENT_METRICS` | `adapters/outbound/metrics/otel-payment-metrics.ts` | métricas de negócio (ver [Métricas de negócio](#métricas-de-negócio)) |
| assinatura | `adapters/inbound/webhooks/mercadopago-signature{,.guard}.ts` | valida o `x-signature` antes de qualquer outra coisa |

O módulo não importa `ticket` nem `event`: o repositório lê e atualiza `ticket`/`event` dentro da própria transação (é o único jeito de marcar o ticket pago e o pagamento aprovado atomicamente sem uma abstração de unit of work), usando a regra de TTL do `ticket/core`.

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| POST | `/payments/checkout` | sim | `{ ticket_id }` → `{ payment_id, checkout_url, expires_at }` |
| GET | `/payments/:id` | sim (dono) | `{ id, ticket_id, status, amount_cents, currency, expires_at, checkout_url, created_at, updated_at }`; de outra pessoa = 404 |
| POST | `/webhooks/mercadopago` | assinatura | notificação do Mercado Pago (evento "Order (Mercado Pago)") |

**Checkout** (`POST /payments/checkout`)

- O ticket precisa ser do usuário da sessão (senão 403), não pago (409), com a reserva valendo por pelo menos mais 30 s (409 "reserve de novo") e de um evento com preço, não excluído e que não começou (409). Tudo checado com o ticket travado (`FOR UPDATE`) e o relógio do Postgres, o mesmo da reserva.
- **Idempotente**: se já existe checkout pendente da mesma reserva, devolve o mesmo `checkout_url` sem criar outra order. Duas abas ao mesmo tempo: a segunda recebe 409 "já está sendo criado" enquanto a primeira fala com o Mercado Pago. Checkouts de reservas anteriores viram `expired`.
- A order leva `external_reference = payment.id` (uuid), `total_amount` = `price_cents` do **banco** (o cliente nunca manda valor), `expiration_time` = fim da reserva (ex.: `PT4M30S`), `X-Idempotency-Key = payment.id`, URLs de retorno `{FRONTEND_URL}/payment/{success,pending,failure}?payment_id=…` com `auto_return: all` e **boleto/lotérica bloqueados** (`not_allowed_types: [ticket, atm]`): compensam em dias e a reserva dura 5 minutos.
- Mercado Pago fora do ar (rede, timeout, 5xx, 429): 503 e o pagamento vira `cancelled` (dá para tentar de novo). Recusa do Mercado Pago (credencial, dados): 502.

**Webhook** (`POST /webhooks/mercadopago`)

1. **Assinatura**: `x-signature: ts=…,v1=…`; manifesto `id:<data.id da query>;request-id:<x-request-id>;ts:<ts>;`; `v1 = hex(HMAC-SHA256(MP_WEBHOOK_SECRET, manifesto))`, comparado em tempo constante. `ts` fora de `MP_WEBHOOK_TOLERANCE_SECONDS` é recusado (replay). **Sem `MP_WEBHOOK_SECRET`, tudo é recusado** (fail closed). Falhou: 401 e `bilheteria_payments_webhooks_rejected_total{reason}`.
2. O corpo é ignorado: o estado vem de `GET /v1/orders/{data.id}`. A order precisa ter `external_reference` = um pagamento nosso, do mesmo provedor e com a mesma order.
3. **Aprovada** (`processed`): numa transação, trava o ticket e depois o pagamento (sempre nessa ordem, a mesma do checkout: sem deadlock) e confirma se valor e moeda batem, o ticket não foi pago, continua do mesmo dono, é a **mesma reserva** (`reserved_at + TTL == payment.expires_at`) e ela não venceu (`NOW()` do Postgres). Aí `ticket.is_paid = true` e `payment.status = approved` **na mesma transação**.
4. **Aprovada mas sem como entregar** (reserva vencida, ticket de outra pessoa ou já pago, valor diferente): estorno total (`POST /v1/orders/{id}/refund`), `payment.status = refunded`, métricas `rejected{reason}` e `refunded{reason}` e log `warn`.
5. **Recusada/cancelada/expirada** no Mercado Pago: `rejected`/`cancelled`/`expired`. Pendente: nada muda.
6. **Repetida**: estados finais não mudam (updates condicionais e checagem de `approved`/`refunded` com a linha travada); responde 200.
7. Mercado Pago indisponível ao consultar/estornar: **503**, e o Mercado Pago reenvia (15 min, 30 min, 6 h, 48 h...). O estorno usa chave de idempotência nova a cada tentativa: estorno total em dobro é impossível (o segundo recebe `order_already_refunded`, tratado como sucesso).

A reserva continua expirando em 5 minutos sem pagamento (regra do módulo ticket, inalterada) e um ticket pago nunca volta a ficar disponível (a reserva só pega `is_paid = false`).

**O que impede vender o mesmo ingresso duas vezes**: (1) a reserva escolhe ingressos com `FOR UPDATE SKIP LOCKED`; (2) a confirmação trava o ticket e só aprova a reserva paga, ainda válida, do mesmo dono; (3) o `UPDATE ticket … WHERE is_paid = false AND user_id = …` precisa afetar 1 linha, senão a transação aborta; (4) o índice único parcial `payment_one_approved_per_ticket` impede, no banco, dois pagamentos aprovados para o mesmo ticket.

**Status**: `pending` → `approved` | `rejected` | `cancelled` | `expired` | `refunded`. `approved` e `refunded` são finais.

**Eventos antigos**: a migration `20261103120000_payment` deixa `price_cents` nulo nos eventos que já existiam (não há preço certo para inventar; um padrão venderia por um valor que o organizador nunca definiu). Eles aparecem com "Preço a definir" e o checkout recusa (409) até ganharem preço (hoje, direto no banco).

#### Variáveis do pagamento

| Variável | Padrão | Uso |
| --- | --- | --- |
| `MP_ACCESS_TOKEN` | — | access token da aplicação (em dev, o de **teste**). Vazio: a API sobe e os pagamentos respondem 502 |
| `MP_WEBHOOK_SECRET` | — | assinatura secreta do webhook, gerada no painel ao cadastrar a URL. Vazio: webhook sempre 401 |
| `MP_NOTIFICATION_URL` | — | só referência: a URL a cadastrar no painel (`https://<túnel>/webhooks/mercadopago`). A API de Orders do Checkout Pro não tem URL de notificação por pedido |
| `MP_WEBHOOK_TOLERANCE_SECONDS` | `300` | tolerância do `ts` da assinatura |
| `MP_HTTP_TIMEOUT_MS` | `5000` | timeout por chamada ao Mercado Pago (1 a 15000; valor inválido impede a API de subir) |
| `MP_API_BASE_URL` | `https://api.mercadopago.com` | só para testes |
| `MP_PUBLIC_KEY` | — | não usada (o Checkout Pro redireciona; não há SDK JS no front) |
| `FRONTEND_URL` | — | base das URLs de retorno do checkout |

#### Testando no ambiente de teste do Mercado Pago

1. Use as **credenciais de teste** da aplicação ([Suas integrações](https://www.mercadopago.com.br/developers/panel/app)) em `MP_ACCESS_TOKEN`.
2. Suba o túnel e cadastre o webhook (passo a passo no [README da raiz](../README.md#pagamento-mercado-pago)); copie a assinatura secreta para `MP_WEBHOOK_SECRET` e reinicie a API.
3. Crie um evento com preço, reserve, clique em **Pagar** e, na página do Mercado Pago, entre com um **usuário comprador de teste** (painel > Contas de teste), de preferência numa janela anônima.
4. Cartões de teste (Brasil): Mastercard `5031 4332 1540 6351`, Visa `4235 6477 2802 5682`, Amex `3753 651535 56885`; CVV `123` (Amex `1234`); validade `11/30`; CPF `12345678909`. O **nome do titular** escolhe o resultado: `APRO` aprovado, `OTHE` recusado, `CONT` pendente, `FUND` saldo insuficiente, `SECU` CVV inválido, `EXPI` vencimento. Referência: [cartões de teste](https://www.mercadopago.com.br/developers/en/docs/checkout-api-orders/integration-test/cards).
5. O botão **Simular notificação** do painel manda um evento com `data.id` fictício: a API valida a assinatura, consulta a order, não encontra e responde 200 (ignorada). Serve para conferir túnel + segredo.
6. Estorno: reserve, abra o checkout e pague depois que o contador zerar (se o Mercado Pago ainda deixar) ou reserve de novo o mesmo ingresso com outra conta antes de o webhook chegar. O pagamento vira `refunded` e conta em `bilheteria_payments_refunded_total`.

A documentação do Mercado Pago avisa que pagamentos de teste podem não disparar notificações para a URL cadastrada; nesse caso a tela de retorno fica em "Aguardando a confirmação" e dá para validar o webhook pelo "Simular notificação".


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

## Armazenamento de imagens

Capa e galeria dos eventos e avatar dos usuários ficam num bucket S3 (em dev, o LocalStack de `infra/storage`; infra no [README da raiz](../README.md#armazenamento-de-imagens-s3--localstack)). Guarda-se o **arquivo original** (sem redimensionar nem gerar miniaturas). A API **nunca recebe os bytes**.

### Fluxo: presign → upload direto → confirm

1. **`POST .../upload-url { content_type }`**: a API confere quem pode (dono do evento/`ADMIN`, ou o próprio usuário no avatar) e o tipo (`image/jpeg`, `image/png`, `image/webp`), **gera a chave** (`events/<id>/cover/<uuid>.<ext>`, `events/<id>/photos/<uuid>.<ext>`, `users/<id>/avatar/<uuid>.<ext>`; nunca o nome do arquivo do cliente) e assina um **POST pré-assinado** válido por 5 minutos. A política do POST fixa a chave, o `Content-Type` e o `Cache-Control` (`immutable`: cada envio tem chave nova) e limita o tamanho com `content-length-range` de 1 B a 5 MB. Por isso POST e não PUT pré-assinado: o PUT não consegue limitar o tamanho.
2. **O navegador envia direto ao bucket** (`multipart/form-data`: os `fields` devolvidos e o arquivo por último, no campo `file`). O S3 recusa arquivo grande (400 `EntityTooLarge`), outro tipo ou outra chave (403).
3. **`PUT .../cover`, `POST .../photos` ou `PUT /users/me/avatar` com `{ key }`**: a API confere que a chave é do prefixo daquele recurso (chave de outro evento/usuário é 400 sem tocar no bucket), faz `HeadObject` (existe? tamanho entre 1 B e 5 MB? `Content-Type` igual ao da extensão?) e lê os **12 primeiros bytes** para conferir a assinatura do formato (JPEG `FFD8FF`, PNG `89504E47…`, WebP `RIFF….WEBP`). Objeto inválido é apagado e a resposta é 400. Só então a chave é gravada no Postgres.
4. **Substituir/remover** (capa, avatar, foto da galeria) apaga o objeto antigo do bucket **depois** de gravar a referência nova. É melhor esforço: falha vira log `warn` e `bilheteria_images_delete_failures_total`, nunca erro para o usuário. Confirmar duas vezes a mesma chave não duplica nem apaga a imagem atual.

Outras garantias:

- **Galeria até 10**: a confirmação trava a linha do evento (`SELECT ... FOR UPDATE`), conta e insere na mesma transação; confirmações simultâneas entram em fila e a 11ª recebe 409 (o objeto dela é apagado). O `upload-url` também recusa com a galeria cheia, mas só para poupar o envio. Conferido com 12 confirmações paralelas: 10 gravadas, 2 × 409.
- **Ordem**: `(event_id, position)` é único; `PATCH .../photos/order` recebe a galeria inteira na ordem nova, passa por posições negativas e grava 0..n-1 na mesma transação.
- **Leitura pública**: a URL servida é `STORAGE_PUBLIC_URL + "/" + chave`. O banco guarda só a chave, então trocar de provedor ou pôr um CDN na frente não mexe no banco.
- **Bucket fora do ar**: as rotas de upload/confirmação respondem 503; o resto da API não depende do S3 (o client não conecta ao subir).
- **Não feito**: uploads pré-assinados que nunca são confirmados deixam o objeto no bucket (a chave já é a final). Em produção, dá para limpar com um job ou enviar para um prefixo `tmp/` com regra de *lifecycle* e copiar na confirmação.

### Peças no código

| Peça | Arquivo | Papel |
| --- | --- | --- |
| regras | `storage/core/entities/image.ts` | tipos aceitos, 5 MB, prefixos, formato da chave, assinatura dos formatos |
| `IMAGE_STORAGE_SERVICE` | `storage/application/services/image-storage.service.ts` | porta inbound usada por `event` e `users`: presign, confirmação, URL pública, remoção silenciosa |
| `OBJECT_STORAGE` | `storage/adapters/outbound/storage/s3-object-storage.ts` | `@aws-sdk/client-s3` + `@aws-sdk/s3-presigned-post`; rede/5xx/429 viram `ObjectStorageUnavailableError` (503) |
| `STORAGE_METRICS` | `storage/adapters/outbound/metrics/otel-storage-metrics.ts` | `bilheteria.images.*` (ver [Métricas de negócio](#métricas-de-negócio)) |
| `EVENT_IMAGE_SERVICE` | `event/application/services/event-image.service.ts` | quem pode, limite da galeria, troca/remoção da capa e das fotos |
| `EVENT_IMAGE_REPOSITORY` | `event/adapters/outbound/repositories/event-image.repository.ts` | transações com o evento travado |
| avatar | `users/application/services/user.service.ts` e `users/adapters/outbound/auth/better-auth.ts` | `avatar_key` + `customSession` (`avatarUrl`) |

### Variáveis do armazenamento

| Variável | Padrão | Uso |
| --- | --- | --- |
| `STORAGE_S3_BUCKET` | `bilheteria-images` | bucket |
| `STORAGE_S3_REGION` | `us-east-1` | região (no R2: `auto`) |
| `STORAGE_S3_ENDPOINT` | — | vazio = AWS S3; LocalStack: `http://localhost:4566` (o navegador também precisa alcançar esse endereço: o POST vai direto para ele) |
| `STORAGE_S3_FORCE_PATH_STYLE` | `false` | `true` no LocalStack/MinIO (`http://host/bucket/chave`) |
| `STORAGE_S3_ACCESS_KEY_ID` / `STORAGE_S3_SECRET_ACCESS_KEY` | — | vazias = cadeia padrão da AWS (variáveis `AWS_*`, perfil, role da máquina). LocalStack: `test` / `test` |
| `STORAGE_PUBLIC_URL` | derivada | base das URLs servidas; sem ela: `{endpoint}/{bucket}` (path-style) ou `https://{bucket}.s3.{region}.amazonaws.com` |

### Trocando para S3 de verdade (ou CloudFront, R2, MinIO)

Só `.env`, nada de código:

- **AWS S3**: crie o bucket, aplique o CORS (origem do front, métodos `POST`/`GET`/`HEAD`) e a política de leitura pública de `infra/storage/localstack/init-s3.sh` (ou deixe o bucket privado e sirva por CloudFront com OAC). No `.env`: `STORAGE_S3_ENDPOINT=` vazio, `STORAGE_S3_FORCE_PATH_STYLE=false`, `STORAGE_S3_REGION=<região>`, credenciais de um usuário/role com `s3:PutObject`, `s3:GetObject` e `s3:DeleteObject` no bucket (o POST pré-assinado é assinado com elas) e `STORAGE_PUBLIC_URL=https://<bucket>.s3.<região>.amazonaws.com` ou o domínio do CloudFront.
- **Cloudflare R2**: `STORAGE_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `STORAGE_S3_REGION=auto`, chaves de API do R2, CORS no bucket e `STORAGE_PUBLIC_URL` = domínio público do bucket (`r2.dev` ou domínio próprio).
- **MinIO**: igual ao LocalStack (`STORAGE_S3_FORCE_PATH_STYLE=true` e o endpoint do MinIO).

### Testes

Unitários sem S3: o adapter é testado com o SDK mockado (`S3Client.prototype.send` e `createPresignedPost`), o service de imagens com a porta mockada (validação, 503, objeto inválido apagado), o `EventImageService` (autorização, limite, troca/remoção com o objeto antigo apagado) e o repositório (lock antes da contagem, posições, reordenação em duas fases). O e2e confere `cover_url`/`photos` nas respostas e que todas as rotas de imagem exigem sessão.


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
| `MP_*` | Mercado Pago, ver [Variáveis do pagamento](#variáveis-do-pagamento) |
| `STORAGE_*` | bucket das imagens, ver [Variáveis do armazenamento](#variáveis-do-armazenamento) |
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
}

// ticket.module.ts
{provide: TICKET_METRICS, useClass: OtelTicketMetrics},   // adapters/outbound/metrics/otel-ticket-metrics.ts
```

As métricas de pagamento moraram na `TICKET_METRICS` até o módulo `payment` existir; agora ficam na `PAYMENT_METRICS` (quem confirma o pagamento é o módulo payment), com os **mesmos nomes** (`bilheteria_payments_confirmed_total`, `bilheteria_payments_rejected_total{reason}`), então dashboards e a conversão reserva → pagamento continuam funcionando.

O adapter recebe o `Meter` por DI (`OTEL_METER`, exportado pelo `ObservabilityModule`), o que permite testá-lo com um `MeterProvider` em memória (`test/utils/otel.ts`). Para uma métrica nova: método na porta, implementação no adapter, chamada no service, teste do adapter e do service.

| Métrica (Prometheus) | Tipo | Labels | Significado |
| --- | --- | --- | --- |
| `bilheteria_reservations_total` | counter | `outcome` | tentativas de reserva por desfecho: `reserved`, `limit_reached`, `sold_out`, `no_cpf`, `event_started`, `event_not_found` |
| `bilheteria_reservation_duration_seconds` | histograma | `outcome` | duração da tentativa de reserva (mesmos desfechos) |
| `bilheteria_payments_confirmed_total` | counter | — | pagamentos confirmados (ticket pago) |
| `bilheteria_payments_rejected_total` | counter | `reason` | aprovados pelo Mercado Pago mas recusados por nós (viram estorno): `expired`, `wrong_owner`, `already_paid`, `amount_mismatch` |
| `bilheteria_payments_refunded_total` | counter | `reason` | estornos concluídos (mesmos motivos) |
| `bilheteria_payments_not_approved_total` | counter | `status` | encerrados sem cobrança no Mercado Pago: `rejected`, `cancelled`, `expired` |
| `bilheteria_payments_checkouts_total` | counter | `outcome` | checkouts abertos: `created` (nova order) ou `reused` (idempotência) |
| `bilheteria_payments_webhooks_rejected_total` | counter | `reason` | notificações recusadas antes de processar: `missing_secret`, `missing_signature`, `malformed_signature`, `invalid_signature`, `stale_signature` |
| `bilheteria_events_created_total` | counter | — | eventos criados |
| `bilheteria_images_upload_urls_total` | counter | `kind` | POSTs pré-assinados emitidos: `event_cover`, `event_photo`, `user_avatar` |
| `bilheteria_images_uploads_confirmed_total` | counter | `kind` | uploads conferidos no bucket e válidos |
| `bilheteria_images_uploads_rejected_total` | counter | `kind`, `reason` | confirmações recusadas: `invalid_key`, `missing`, `too_large`, `invalid_type`, `invalid_content` |
| `bilheteria_images_delete_failures_total` | counter | `kind` | imagens substituídas/removidas que não foram apagadas do bucket (órfãs) |

No código os instrumentos têm nomes OTel (`bilheteria.reservations`, `bilheteria.reservation.duration` em segundos...); o Alloy converte para os nomes acima. **Nunca** use id de usuário, evento ou ticket como label: cada valor distinto cria uma série nova no Prometheus. Ids vão em atributos de span.

Erro inesperado (ex.: banco fora) não conta como desfecho de negócio: aparece como 5xx nas métricas HTTP e como span com erro.

Também chegam, sem código nosso: `http_server_request_duration_seconds` (por `http_route`, método e status), pool do `pg` (`db_client_connection_*`), event loop/GC/heap do Node (`nodejs_*`, `v8js_*`) e, gerados pelo Tempo, `traces_spanmetrics_*` e `traces_service_graph_*` (com exemplars).

### Traces

Spans automáticos de HTTP, rotas do express, Better Auth, Prisma e `pg`. Span manual só onde agrega: `ticket.reserve` (atributos `event.id` e `outcome`), `payment.checkout` (`ticket.id`, `payment.id`, `outcome`) e `payment.notification` (`provider.order_id`, `payment.id`, `provider.status`, `outcome`), aberto pela porta `TRACING` (`modules/observability/application/ports/outbound/tracing/tracing.port.ts`) para o service continuar sem OpenTelemetry. Recusa de negócio (4xx) fica registrada como evento no span, mas não marca o span como erro.

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
3. **Pagamento com Mercado Pago** — feito (ver [payment](#payment)):
   - [x] Checkout Pro pela API de Orders, preço único por evento, `external_reference` = id do pagamento.
   - [x] Webhook só do Mercado Pago (assinatura `x-signature`, fail closed), consultando a order na API antes de confirmar.
   - [x] Confirmação idempotente e atômica (ticket pago + pagamento aprovado na mesma transação); estorno automático quando a reserva já não vale.
   - [x] `POST /webhook/ticket/payment` (público, sem assinatura) removido.
   - Depois: preço por setor/meia-entrada; endpoint para o organizador definir o preço de eventos antigos; reconciliação periódica (job que consulta orders `pending` antigas, para o caso de o webhook nunca chegar); painel e alerta de `webhooks_rejected`/`refunded` no Grafana.

4. **Imagens no S3** — feito (ver [Armazenamento de imagens](#armazenamento-de-imagens)):
   - [x] Capa e galeria (até 10, reordenável) do evento; avatar do usuário com fallback para a foto do Google.
   - [x] Upload direto do navegador com POST pré-assinado (tamanho/tipo garantidos pelo S3) e confirmação conferindo o objeto.
   - Depois: miniaturas/redimensionamento (ex.: worker na confirmação), limpeza de uploads nunca confirmados, `next/image` com `remotePatterns` vindo do `.env` e persistência do S3 local em dev.

### Pendências encontradas pelos testes
- `GET /status/:id`: `reserved` inclui ingressos pagos (`total - available`).
- Status usa `Date.now()` da aplicação e a reserva usa `NOW()` do Postgres.
- DTOs: `event_id` aceita 0/negativo, `capacity` em string é rejeitado.
