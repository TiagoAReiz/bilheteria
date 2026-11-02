export class Event {
    id: number;
    name: string;
    description: string | null;
    location: string;
    starts_at: Date;
    capacity: number;
    organizer_id: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}
