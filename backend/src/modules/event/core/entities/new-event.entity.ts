export class NewEvent {
  name: string;
  description?: string;
  location: string;
  starts_at: Date;
  capacity: number;
  price_cents: number;
  max_tickets_per_cpf: number;
  /** ausente = vende desde a criação */
  sales_starts_at?: Date;
  organizer_id: string;
}
