export class Event {
  id: number;
  name: string;
  description: string | null;
  location: string;
  starts_at: Date;
  capacity: number;
  // preço único do ingresso em centavos (BRL); null só em eventos anteriores ao pagamento (sem venda)
  price_cents: number | null;
  // ingressos ativos (pagos ou reservados) que um mesmo CPF pode ter neste evento
  max_tickets_per_cpf: number;
  // contador aproximado (job de disponibilidade); o numero exato vem do GET /status/:id
  available_tickets: number;
  // chave da capa no bucket; a API responde `cover_url` (ver EventView)
  cover_key: string | null;
  // início das vendas; null = vendendo. Em breve enquanto estiver no futuro (ver isComingSoon)
  sales_starts_at: Date | null;
  organizer_id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}
