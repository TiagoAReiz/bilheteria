// O público e os eventos são do Brasil: horário de Brasília em todo email, seja qual for o
// fuso do servidor (em produção normalmente UTC).
const TIME_ZONE = 'America/Sao_Paulo';

const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "sábado, 20 de junho de 2099 às 20:00" */
export function formatEventDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(
    cents / 100,
  );
}
