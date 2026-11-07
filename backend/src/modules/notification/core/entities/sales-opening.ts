/**
 * Quem favoritou um evento "em breve" recebe um email quando faltar até esta antecedência para
 * a abertura das vendas. Um por pessoa por abertura: a dedupe key é
 * `sales-opening:<eventId>:<sales_starts_at ISO>:<userId>`, então adiar a abertura depois do
 * aviso gera um aviso novo (com a data certa), e rodar o agendador de novo não duplica.
 */
export const SALES_OPENING_NOTICE_MS = 60 * 60_000;
