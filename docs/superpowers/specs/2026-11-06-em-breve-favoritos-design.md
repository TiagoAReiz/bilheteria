# Em breve, início de vendas programado e favoritos — design

Data: 2026-11-06

## Intenção

Hoje todo evento nasce vendendo, as fotos só entram depois da criação e não há como guardar um evento
para depois. O organizador quer **anunciar antes de vender** (gerar expectativa) e o comprador quer
**ser avisado quando der para comprar**. Três peças:

1. **Início de vendas programado**: o organizador escolhe quando as vendas abrem. Até lá o evento
   aparece como **"Em breve"**, com página própria, mas sem compra.
2. **Fotos na criação**: capa e galeria já no formulário de criação.
3. **Favoritos (wishlist)**: o comprador favorita qualquer evento (em breve ou à venda) e tem uma aba
   com a lista. Para os "em breve", recebe **um email 1 hora antes de as vendas abrirem**.

## Metas

- Seção **"Em breve"** no topo da bilheteria (página inicial pública), acima da lista atual.
- Card e página do evento com **coração** para favoritar/desfavoritar.
- Página do evento em breve: mesmas informações de hoje, sem botão de compra; no lugar,
  "Vendas abrem em DD/MM às HH:MM".
- Nova aba **Favoritos** no menu privado (ao lado de "Meus ingressos").
- Email "as vendas abrem em 1 hora" para quem favoritou um evento em breve.
- Formulário de criação com campo opcional **"Início das vendas"** e upload de capa + galeria.
- Edição: o organizador pode **adiar ou antecipar** o início das vendas (inclusive "abrir agora").

## Não-metas

- Nenhum outro email (nada de "começou", "está chegando" em vários dias, lembrete do show).
- Favorito não reserva ingresso nem dá prioridade de compra.
- Fila virtual / sala de espera na abertura das vendas.
- Notificação push ou SMS.

## Anti-metas (seria um fracasso mesmo funcionando)

- **Vender antes da hora**: reserva ou checkout de evento em breve passando por qualquer caminho
  (API direta, aba antiga aberta, reserva feita antes do adiamento).
- **Email errado**: avisar uma data que o organizador já mudou, avisar quem desfavoritou, mandar o
  mesmo aviso duas vezes, ou avisar evento cancelado (soft delete).
- Perder o evento recém-criado porque uma foto falhou no upload.

## Decisões (da conversa)

### Regras do início de vendas

- Coluna nova `event.sales_starts_at TIMESTAMPTZ NULL`. **Nulo = vendendo** (todos os eventos atuais
  continuam como estão).
- **Em breve** ⇔ `sales_starts_at > now()`. Calculado na leitura, sem coluna de status.
- Criação: campo opcional; se informado, tem que ser no futuro e **antes de `starts_at`**.
- Edição: pode adiar ou antecipar **enquanto as vendas ainda não abriram**. "Abrir agora" grava
  `NULL`. Depois de abertas, a data não muda mais (já pode haver ingresso vendido). Mudar `starts_at`
  para antes de `sales_starts_at` é recusado.
- **Bloqueio de venda nos dois pontos**: a reserva (`TicketService.reserve`, junto do teste de
  `event_started`) devolve um novo resultado `sales_not_started` (HTTP 409 com mensagem clara), e o
  checkout (`payment-rules`, `not_on_sale`) também recusa enquanto `sales_starts_at > now`. O
  checkout precisa do bloqueio porque uma reserva pode ter sido feita antes de o organizador adiar.

### Fotos na criação

- **Só no front**: o formulário cria o evento (`POST /events`) e, em seguida, sobe capa e fotos pelos
  endpoints que já existem (`/events/:id/cover/...`, `/events/:id/photos/...`). Mesmos limites de hoje
  (capa + até 10 fotos, tipos/tamanhos atuais).
- Se alguma foto falhar, o evento continua criado; a tela informa qual falhou e leva para a edição,
  onde dá para reenviar. Nada muda no backend.

### Favoritos

- Tabela `event_favorite (user_id, event_id, created_at)`, PK composta, FK para `user` e `event`.
  Fora da publication `bilheteria_search`.
- Exige login. Coração sem sessão leva ao login e volta para a página.
- Vale para qualquer evento ainda não acontecido e não cancelado. Favoritar é idempotente
  (favoritar duas vezes não erra); desfavoritar o que não existe também não.
- API:
  - `PUT /events/:id/favorite` e `DELETE /events/:id/favorite` (204).
  - `GET /favorites`: eventos favoritados do usuário, com os dados do card + `sales_starts_at`;
    exclui eventos passados e cancelados.
- Aba **Favoritos** (`/favorites`, área privada): duas seções, **"Em breve"** e **"À venda"**.
- O front marca os corações a partir do `GET /favorites` do usuário logado (conjunto de ids).

### Email "vendas abrem em 1 hora"

- Novo `kind` no módulo `notification`: `sales_opening`, com template React Email próprio (nome do
  evento, data/hora de abertura, local, data do show, link para a página do evento).
- **Agendador** no módulo de notificação (mesmo padrão `setInterval`/SchedulerRegistry do outbox),
  a cada **1 minuto**: para cada evento não cancelado com
  `now() < sales_starts_at <= now() + 1h`, enfileira (`createMany` + `skipDuplicates`) um email para
  cada favorito.
- **Dedupe key** `sales-opening:<eventId>:<sales_starts_at ISO>:<userId>`:
  - o agendador pode rodar quantas vezes for, sai um email por pessoa por abertura;
  - quem favorita faltando menos de 1 h entra na próxima rodada (em até ~1 min), sem código extra;
  - se o organizador **adiar antes** da janela, nada foi enfileirado, e o email sai 1 h antes da
    nova data;
  - se adiar **depois** de o aviso sair, a data nova gera chave nova e a pessoa recebe um segundo
    aviso, com a data certa.
- Quem desfavoritou antes da rodada não é enfileirado. Depois que as vendas abrem, nada é enviado
  (se o agendador ficou parado e perdeu a janela, o aviso não sai atrasado).
- Envio, retry e métricas são os do outbox atual (Resend). Sem domínio verificado o Resend só
  entrega para o email da conta; os outros viram `failed`, já documentado.

### Busca (Elasticsearch)

- O documento `events` ganha `sales_starts_at` (date): campo no index template + `mapping-additions`
  (como foi o `cover_key`), transform `event-document.exs` e o `index-contract.spec.ts`.
- Eventos em breve aparecem na busca com selo **"Em breve"** e sem compra.

### Telas

- **Página inicial**: seção "Em breve" no topo (cards com capa, nome, data do show, "vendas abrem
  em ...", coração). Some quando não há nenhum evento em breve. A lista atual continua abaixo.
  Os dados vêm do Postgres (sem depender do índice) por um filtro na listagem de eventos.
- **Página do evento**: coração; em breve, troca o bloco de compra pelo aviso da data de abertura.
  Quando a hora passa com a página aberta, o botão de compra só aparece ao recarregar (o servidor
  bloqueia de qualquer jeito).
- **Criação/edição**: campo "Início das vendas" (data e hora, fuso de São Paulo, como os demais
  campos de data). Na edição, desabilitado depois que as vendas abriram, com um botão "Abrir vendas
  agora" enquanto estiver em breve.
- **Menu privado**: item "Favoritos".

## Restrições

- Arquitetura hexagonal atual (ports/adapters por módulo), TDD com vitest (back) e jest (front);
  testes, tsc e build limpos antes de cada commit.
- Migrations escritas à mão quando o Docker estiver fora; CHECK no banco para a regra
  `sales_starts_at < starts_at`.
- Versões de pacotes com pelo menos 2 semanas (nenhum pacote novo previsto).
- Sem co-autoria do Claude nos commits; push só quando o usuário pedir.

## Fica a critério de quem implementar

- Formato exato do filtro "em breve" na listagem (`GET /events?status=coming_soon` ou rota própria).
- Layout dos cards e da seção, seguindo o visual atual.
- Organização interna do módulo de favoritos (módulo novo `favorite` ou dentro de `event`).
- Textos de interface e do email.
