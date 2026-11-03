export class NewEvent {
    name: string;
    description?: string;
    location: string;
    starts_at: Date;
    capacity: number;
    price_cents: number;
    max_tickets_per_cpf: number;
    organizer_id: string;
}
