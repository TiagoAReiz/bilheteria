export class Ticket {
  id: number;
  user_id: string | null;
  reserved_at: Date | null;
  is_paid: boolean;
  event_id: number;
}
