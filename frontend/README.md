# Bilheteria — Front

Front-end em Next.js (App Router) da [API Bilheteria](../bilheteria) (NestJS + Better Auth): lista eventos, mostra disponibilidade e preço, reserva e paga ingressos (Mercado Pago), cadastro de CPF, foto de perfil, perfil de organizador, criação de eventos e capa/galeria dos eventos (upload direto ao S3 com URL pré-assinada; ver [backend/README.md](../backend/README.md#armazenamento-de-imagens)).

**Stack:** Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · shadcn/ui (Radix) · axios · react-hook-form + zod · sonner (toasts) · Jest + React Testing Library.

## Como rodar

```bash
npm install
cp .env.example .env.local   # ajuste a URL da API se precisar
npm run dev                  # http://localhost:3001
```

A API precisa estar rodando (padrão `http://localhost:3000`) com `FRONTEND_URL=http://localhost:3001` no `.env` dela, que libera CORS com cookies e o callback do OAuth.

## Variáveis de ambiente

| Variável              | Padrão                  | Uso                                                 |
| --------------------- | ----------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | URL base da API NestJS (usada pela instância axios) |

## Scripts

| Script              | O que faz                                              |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | servidor de desenvolvimento na porta **3001**          |
| `npm run build`     | build de produção                                      |
| `npm run start`     | sobe o build de produção na porta **3001**             |
| `npm run lint`      | ESLint (config do Next)                                |
| `npm run typecheck` | `tsc --noEmit`                                         |
| `npm test`          | testes com Jest (`npm run test:watch` para modo watch) |

## Organização de pastas

```
src/
├── app/                         # rotas (App Router); os page.tsx só compõem componentes dos módulos
│   ├── layout.tsx               # layout raiz: fontes, <Providers> (sessão + Toaster)
│   ├── globals.css              # Tailwind + tema do shadcn
│   ├── (public)/                # layout com header
│   │   ├── page.tsx             # /             próximos eventos
│   │   ├── events/[id]/page.tsx # /events/:id   detalhe + reserva
│   │   └── login/page.tsx       # /login
│   └── (private)/               # layout com header + sidebar fixos; exige login
│       ├── profile/page.tsx     # /profile
│       ├── events/new/page.tsx  # /events/new   (ORGANIZER/ADMIN)
│       └── payment/{success,pending,failure}/page.tsx  # retorno do Mercado Pago
├── modules/                     # um módulo por página/feature
│   ├── events/                  # lista da home
│   ├── event-detail/            # detalhe, status dos ingressos, reserva, capa e galeria (com edição para o dono)
│   ├── login/                   # login social
│   ├── profile/                 # perfil, foto, CPF, virar organizador
│   ├── payment/                 # botão Pagar (checkout + contagem) e telas de retorno
│   └── new-event/               # formulário de criação de evento
│       ├── components/          # componentes da página
│       ├── services/            # chamadas ao backend (axios)
│       ├── types/               # DTOs de request/response (e schema zod do formulário)
│       ├── hooks/               # estado/comportamento (useEvents, useReserveTicket, ...)
│       └── __tests__/           # testes do módulo
├── shared/                      # o que é usado em mais de um lugar
│   ├── components/
│   │   ├── ui/                  # componentes gerados pelo shadcn
│   │   ├── layout/              # AppHeader, PrivateSidebar, RequireSession
│   │   ├── providers.tsx
│   │   └── user-avatar.tsx
│   ├── services/                # api.ts (instância axios única) e session.service.ts
│   ├── hooks/                   # useSession (contexto de sessão), useAsync
│   ├── types/                   # User/Role, EventResponse, Session
│   ├── lib/                     # cn, api-error, auth-redirect, cpf, format, env, navigation
│   └── __tests__/
├── __tests__/proxy.test.ts
└── proxy.ts                     # proteção das rotas privadas (no Next 16 o "middleware" se chama proxy)
jest/                            # setup do Jest e helpers de teste (alias @test/*)
```

Não existe `src/pages/`: essa pasta ativaria o Pages Router legado. As "páginas" ficam em `src/app/`, organizadas nos route groups `(public)` e `(private)`, que não aparecem na URL.

### shadcn/ui

O `components.json` gera os componentes em `@/shared/components/ui` e usa o util `cn` de `@/shared/lib/utils`. Para adicionar um componente:

```bash
npx shadcn@latest add dialog
```

> Importante: a versão 4.x do CLI às vezes escreve `import { cn } from "cn"` (um pacote npm). Depois de rodar `add`, troque para `@/shared/lib/utils`.

## Busca na home

A home (`/`) tem uma barra de busca (`modules/events/components/event-search-bar.tsx`) sobre a lista:

- **Autocomplete** (`event-search-input.tsx` + `hooks/useEventSuggestions.ts`): combobox acessível (setas, Enter, Esc) que chama `GET /events/suggest` depois de 250 ms sem digitação e a partir de 2 caracteres, cancelando a requisição anterior. Escolher uma sugestão abre o evento; falha do autocomplete só esconde a lista.
- **Filtros**: local (opções vindas da faceta `locations` da API), período (`De`/`Até`, dias inteiros no fuso do navegador) e "Só com ingressos disponíveis". "Buscar" chama `GET /events/search` (`hooks/useEventSearch.ts`), com paginação.
- **Sem filtro**, a home mostra a lista de sempre (`GET /events`, lida do Postgres). Se a busca estiver fora do ar (503), aparece a mensagem da API com "Tentar novamente" e "Ver todos os eventos".
- A disponibilidade nos cards da busca é aproximada ("Ingressos disponíveis"/"Esgotado"); o número exato fica na página do evento.

> Rodando os testes de dentro de um caminho com diretório iniciado por ponto (ex.: uma worktree em `.claude/worktrees/...`), o `testMatch` com `<rootDir>` não encontra nada. Nesse caso: `npx jest --testMatch '**/__tests__/**/*.test.{ts,tsx}'`.

## Pagamento

- **Preço**: o formulário de criar evento tem "Preço do ingresso (R$)". A pessoa digita em reais ("89,90", "1.234,56", "50.00"); `shared/lib/money.ts` converte para centavos inteiros sem passar por float e o schema valida R$ 1,00 a R$ 100.000,00 (mesmos limites da API). O detalhe do evento mostra o preço em BRL; evento antigo sem preço mostra "Preço a definir" e não deixa reservar.
- **Pagar**: depois de reservar, o card da reserva mostra **Pagar** e a contagem regressiva até o fim da reserva (`modules/payment/components/pay-ticket-button.tsx`). O clique chama `POST /payments/checkout` (só o `ticket_id`: o valor vem do backend) e o navegador vai para o `checkout_url`, que só é aceito se for HTTPS de um domínio do Mercado Pago. Quando a contagem zera, o botão some e aparece "Sua reserva expirou. Reserve de novo".
- **Retorno**: o Mercado Pago volta para `/payment/success`, `/payment/pending` ou `/payment/failure` com `?payment_id=` (rotas privadas). As três usam `PaymentReturnView`, que consulta `GET /payments/:id` e repete a cada 3 s enquanto o status for `pending` (até ~2 min; depois, botão "Atualizar"). **A URL de retorno não é o resultado**: quem confirma é o webhook do Mercado Pago no backend, e a tela mostra sempre o status registrado pela API (aprovado, recusado, cancelado, expirado ou estornado).

## Autenticação

- Login social pelo Better Auth: `POST /api/auth/sign-in/social` devolve a URL do provedor e o navegador é redirecionado para ela. O `callbackURL` é a URL absoluta do front, com o `?redirect=` original.
- A sessão fica num cookie httpOnly da API. Por isso o axios usa `withCredentials: true`.
- `src/proxy.ts` faz uma checagem **otimista**: se não houver o cookie `better-auth.session_token` (ou `__Secure-better-auth.session_token` em HTTPS) em `/profile`, `/events/new` ou `/payment/*`, redireciona para `/login?redirect=<rota>`. A regra fica em `shared/lib/auth-redirect.ts`, uma função pura e testada.
- A validação de verdade é do backend. Se uma chamada voltar 401, o interceptor do axios manda para `/login`. No cliente, o `RequireSession` do layout privado também redireciona quando `get-session` volta vazio (cookie expirado).
- O proxy só enxerga o cookie quando front e API estão no mesmo host (ex.: `localhost:3001` e `localhost:3000`; cookies não levam a porta em conta). Em produção, use subdomínios do mesmo domínio ou um proxy reverso.

## Erros

Os erros do Nest vêm como `{ statusCode, message, error }`. `getErrorMessage()` (em `shared/lib/api-error.ts`) extrai a mensagem, aceitando `message` como string ou array, e as telas mostram essa mensagem em toast (sonner) e/ou em alerta.

## Testes

Os testes ficam em pastas `__tests__/` dentro de cada módulo, em `shared/` e em `src/__tests__` (proxy). Eles cobrem:

- services: o axios é mockado e os testes conferem URL e body;
- hooks: `renderHook`;
- componentes: lista de eventos, botão de reserva (403/404/409/sucesso), botão de pagar (redirecionamento, contagem, expiração, erro), telas de retorno do pagamento (status real, polling, id inválido, 404), formulário de CPF, formulário (com preço) e guarda de criação de evento, login e perfil;
- dinheiro: conversão reais ↔ centavos e formatação em BRL;
- regras do proxy, com uma função pura e o `proxy()` executado com `NextRequest`.

```bash
npm test
```
