export class NewEvent {
    name: string;
    description?: string;
    location: string;
    starts_at: Date;
    capacity: number;
    price_cents: number;
    organizer_id: string;
}
