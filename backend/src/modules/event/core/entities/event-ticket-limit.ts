/**
 * Limite de ingressos ativos por CPF num evento, escolhido pelo organizador.
 * Os mesmos números estão no CHECK `event_max_tickets_per_cpf_range` da migration.
 */
export const MIN_TICKETS_PER_CPF = 1;
export const MAX_TICKETS_PER_CPF = 10;
