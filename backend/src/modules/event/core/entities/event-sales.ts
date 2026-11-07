import { Event } from './event.entity.js';

/** "Em breve": as vendas têm data marcada e ela ainda não chegou. */
export function isComingSoon(
  event: Pick<Event, 'sales_starts_at'>,
  now: Date,
): boolean {
  return (
    event.sales_starts_at !== null &&
    event.sales_starts_at.getTime() > now.getTime()
  );
}
