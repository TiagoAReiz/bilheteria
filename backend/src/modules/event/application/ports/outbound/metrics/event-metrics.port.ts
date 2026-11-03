export const EVENT_METRICS = Symbol('EVENT_METRICS');

// Métricas de negócio do módulo em termos do domínio (ver TicketMetricsPort).
export interface EventMetricsPort {
    eventCreated(): void;
}
