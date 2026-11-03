export class Event {
    id: number;
    name: string;
    description: string | null;
    location: string;
    starts_at: Date;
    capacity: number;
    // preço único do ingresso em centavos (BRL); null só em eventos anteriores ao pagamento (sem venda)
    price_cents: number | null;
    // contador aproximado (job de disponibilidade); o numero exato vem do GET /status/:id
    available_tickets: number;
    organizer_id: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}
