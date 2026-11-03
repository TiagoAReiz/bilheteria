export class Event {
    id: number;
    name: string;
    description: string | null;
    location: string;
    starts_at: Date;
    capacity: number;
    // contador aproximado (job de disponibilidade); o numero exato vem do GET /status/:id
    available_tickets: number;
    organizer_id: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}
