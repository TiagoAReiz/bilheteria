import { cpf as cpfValidator } from "cpf-cnpj-validator";

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Aplica a máscara 000.000.000-00 (aceita entrada parcial). */
export function maskCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

/** Mesma validação do backend: cpf-cnpj-validator (tamanho, lista negra e dígitos verificadores). */
export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value);
  return digits.length === 11 && cpfValidator.isValid(digits, true);
}

/** Exibição no padrão de mercado (LGPD): só os 6 dígitos do meio, ex. ***.982.247-**. */
export function maskCpfForDisplay(value: string): string {
  const d = onlyDigits(value).padEnd(11, "*");
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}
