/** Item de GET /tickets/me: ingresso pago ou com reserva ainda valendo. */
export type MyTicketStatus = "paid" | "reserved";

export interface MyTicketResponse {
  id: number;
  status: MyTicketStatus;
  /** Fim da reserva (ISO); nulo quando já pago. */
  reserved_until: string | null;
  event: {
    id: number;
    name: string;
    location: string;
    starts_at: string;
  };
}
