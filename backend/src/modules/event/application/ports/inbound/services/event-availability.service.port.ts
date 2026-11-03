export const EVENT_AVAILABILITY_SERVICE = Symbol('EVENT_AVAILABILITY_SERVICE');

export interface EventAvailabilityServicePort {
    /** Recalcula `available_tickets` dos eventos futuros; retorna quantos eventos mudaram. */
    refreshAvailableTickets(): Promise<number>;
}
