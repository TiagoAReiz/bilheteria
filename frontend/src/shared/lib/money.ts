/** Dinheiro trafega em centavos inteiros (como na API); reais só na tela. */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 5000 -> "R$ 50,00" */
export function formatBRL(cents: number): string {
  return BRL.format(cents / 100);
}

/**
 * Converte o que a pessoa digitou em reais para centavos, sem passar por float.
 * Aceita "50", "50,5", "50,50", "1.234,56" (pt-BR), "50.00" e um "R$" opcional.
 * Retorna null se não for um valor válido (negativo, mais de 2 casas, letras...).
 */
export function parseReaisToCents(input: string): number | null {
  const value = input.trim().replace(/^R\$\s*/i, "");
  let integer: string;
  let decimals: string;

  const ptBr = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(value);
  if (ptBr) {
    integer = ptBr[1].replace(/\./g, "");
    decimals = ptBr[2] ?? "";
  } else {
    const dotDecimal = /^(\d+)\.(\d{1,2})$/.exec(value);
    if (!dotDecimal) return null;
    integer = dotDecimal[1];
    decimals = dotDecimal[2];
  }
  if (integer.length > 9) return null;
  return Number(integer) * 100 + Number(decimals.padEnd(2, "0"));
}
