# Bilheteria

API de venda de ingressos em NestJS + Prisma (PostgreSQL), com autenticação via [Better Auth](https://www.better-auth.com/) (login com Google e Facebook).

## Arquitetura

Cada módulo segue arquitetura hexagonal (ports & adapters). O domínio e a aplicação não conhecem Nest HTTP, Prisma nem Better Auth; esses detalhes ficam nos adapters.

```
src/
├── main.ts
├── app.module.ts
├── generated/prisma/          # client gerado pelo Prisma (não editar, não versionado)
└── modules/
    ├── prisma/                # PrismaService compartilhado entre módulos
    └── <modulo>/
        ├── <modulo>.module.ts         # liga portas às implementações (DI)
        ├── core/
        │   └── entities/              # entidades e value objects do domínio
        ├── application/
        │   ├── ports/
        │   │   ├── inbound/services/      # interfaces dos casos de uso (o que o módulo oferece)
        │   │   └── outbound/              # interfaces do que o módulo precisa
        │   │       ├── repositories/      # acesso a banco
        │   │       └── ...                # outras dependências externas (crypto, gateways)
        │   └── services/              # implementação dos casos de uso (implements porta inbound)
        └── adapters/
            ├── dto/                   # DTOs de entrada validados com class-validator
            ├── inbound/controllers/   # controllers HTTP: chamam as portas inbound
            └── outbound/
                ├── repositories/      # implementação das portas outbound com Prisma
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

## Setup

```bash
npm install
cp .env.example .env        # preencher as variáveis
docker compose up -d        # postgres
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

Depois de alterar `prisma/schema.prisma`, rode `npx prisma generate --config prisma7.config.ts` (ou `migrate dev`, que já gera).

## Scripts

```bash
npm run start:dev    # dev com watch
npm run build        # build
npm run lint         # oxlint
npm run test         # testes unitários (vitest)
npm run test:e2e     # testes e2e
npm run test:load    # teste de carga (API rodando)
```
