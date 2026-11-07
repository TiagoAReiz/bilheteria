/** "Em breve": as vendas têm data marcada e ela ainda não chegou (o backend recusa a compra). */
export function isComingSoon(
  event: { sales_starts_at?: string | null },
  now: number = Date.now(),
): boolean {
  return (
    !!event.sales_starts_at && new Date(event.sales_starts_at).getTime() > now
  );
}
