# Em breve + favoritos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** início de vendas programado ("Em breve"), fotos na criação e favoritos com email 1 h antes da abertura.

**Architecture:** coluna `event.sales_starts_at` (nulo = vendendo) checada na reserva e no checkout; tabela `event_favorite` num módulo `favorite`; agendador no `notification` que enfileira `sales_opening` no outbox com dedupe por abertura. O front divide o `GET /events` em "Em breve" e "À venda".

**Tech Stack:** NestJS + Prisma 7 + vitest; Next 16 + React Query + jest; Sequin/Elasticsearch.

**Spec:** `docs/superpowers/specs/2026-11-06-em-breve-favoritos-design.md`

## Global Constraints

- Nulo em `sales_starts_at` = vendendo; em breve ⇔ `sales_starts_at > now()`.
- `sales_starts_at < starts_at` (DTO + regra de edição + CHECK no banco).
- Email só de 1 h antes até a abertura; dedupe `sales-opening:<eventId>:<salesStartsAtISO>:<userId>`.
- Sem pacote novo; sem co-autoria nos commits; push só a pedido.

## Review Focus

- Reserva feita antes de um adiamento → checkout recusa (`not_on_sale`). Teste em `payment-rules.spec`.
- Organizador adia a abertura depois de o aviso sair → chave nova, segundo email. Teste no repositório do agendador (a chave inclui a data).
- Evento cancelado (soft delete) ou passado nos favoritos → não aparece em `GET /favorites` nem gera email. Teste no repositório.
- Edição tenta mudar `sales_starts_at` depois de abertas → 409 `sales_already_open`. Teste em `event-update.spec`.
- Edição muda `starts_at` para antes da abertura → 409 `sales_after_start`. Teste em `event-update.spec`.

---

### Task 1: `sales_starts_at` no evento (back)

**Files:** `prisma/schema.prisma`, migration `20261108120000_event_sales_starts_at`, `core/entities/{event.entity,new-event.entity,event-update}.ts`, `adapters/dto/{create,update}-event-dto.ts`, `event.controller.ts`, `event.repository.ts` + specs.

**Interfaces — Produces:** `Event.sales_starts_at: Date | null`; `EventChanges.sales_starts_at?: Date | null`; rejeições novas `'sales_already_open' | 'sales_after_start'`; helper `isComingSoon(event, now): boolean` em `core/entities/event-sales.ts`.

- [ ] Testes de `checkEventUpdate`: muda data com vendas abertas → `sales_already_open`; data ≥ starts_at (novo ou atual) → `sales_after_start`; null em breve → ok; adiar/antecipar em breve → ok.
- [ ] Testes de DTO: create aceita ausente, recusa passado e ≥ starts_at; update aceita `null`.
- [ ] Implementar; migration com CHECK `sales_starts_at IS NULL OR sales_starts_at < starts_at`.
- [ ] vitest verde; commit.

### Task 2: bloqueio de venda (back)

**Files:** `ticket/application/services/ticket.service.ts` (+ outcome `sales_not_started`, 409 no controller), `payment/core/entities/payment-rules.ts` (`event_sales_starts_at`), query em `payment.repository.ts` + specs.

- [ ] Testes: reserva em breve → `sales_not_started`; checkout com `event_sales_starts_at > now` → `not_on_sale`; e2e da reserva 409.
- [ ] Implementar; vitest verde; commit.

### Task 3: favoritos (back)

**Files:** módulo `src/modules/favorite/` (core, port, repository, service, controller), tabela `event_favorite` (PK `user_id,event_id`, FKs cascade), migration `20261108120100_event_favorite`, `app.module.ts`.

**Interfaces — Produces:** `PUT /events/:id/favorite` 204 (404 se evento inexistente/cancelado/passado), `DELETE /events/:id/favorite` 204, `GET /favorites` → `EventView[]` (futuros, não cancelados, ordem `starts_at`).

- [ ] Testes do service/repository/controller (idempotência, 404, filtro de passados/cancelados).
- [ ] Implementar; vitest + e2e verdes; commit.

### Task 4: email `sales_opening` (back)

**Files:** `notification/core/entities/email.ts` (kind + `salesOpeningEmail`), template `sales-opening-email.tsx`, renderer, `adapters/outbound/repositories/sales-opening.repository.ts` (`enqueueDue(now): Promise<number>`, um `INSERT … SELECT … ON CONFLICT (dedupe_key) DO NOTHING`), `inbound/schedulers/sales-opening.scheduler.ts` (`SALES_OPENING_INTERVAL_MS`, default 60000, 0 desliga).

- [ ] Testes: entidade (dedupe), renderer (assunto/link/data), repositório (janela, cancelado fora, chave com data), scheduler.
- [ ] Implementar; vitest verde; commit.

### Task 5: busca

**Files:** index template de events, `mapping-additions`, `event-document.exs`, `index-contract.spec.ts`; front: selo "Em breve" no resultado.

- [ ] Contrato verde; aplicar mapping no ES local; commit.

### Task 6: front

**Files:** tipos de evento (`sales_starts_at`), home (seção Em breve), `FavoriteButton` + `useFavorites`, página `/favorites` + item no menu, detalhe (bloco "Vendas abrem em…"), criação (campo + fotos após criar), edição (campo + "Abrir vendas agora").

- [ ] Testes jest por componente/hook; implementar; jest + tsc + build verdes; commit.

### Task 7: verificação ponta a ponta

- [ ] `npm run up`; criar evento em breve com fotos, favoritar, ver aba, ver email do agendador (abertura em < 1 h) chegar no Resend; README atualizado; commit.
