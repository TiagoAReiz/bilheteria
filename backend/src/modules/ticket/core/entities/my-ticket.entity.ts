// Ingresso como o dono vê em "Minhas reservas": pago ou com a reserva ainda valendo.
// Reserva expirada não entra: o ingresso já voltou a ficar disponível para outros.
export type MyTicketStatus = 'paid' | 'reserved';

export interface MyTicketEvent {
    id: number;
    name: string;
    location: string;
    starts_at: Date;
}

export interface MyTicket {
    id: number;
    status: MyTicketStatus;
    /** Fim da reserva (reserved_at + TTL); nulo quando já pago. */
    reserved_until: Date | null;
    event: MyTicketEvent;
}

/** Linha bruta do repositório: o serviço decide status e prazo. */
export interface UserTicketRow {
    id: number;
    is_paid: boolean;
    reserved_at: Date | null;
    event: MyTicketEvent;
}
