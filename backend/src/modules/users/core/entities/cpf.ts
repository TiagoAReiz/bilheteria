import { cpf as cpfValidator } from 'cpf-cnpj-validator';

export class Cpf {
  private constructor(readonly value: string) {}

  /** Normaliza (só dígitos) e valida com a cpf-cnpj-validator (tamanho, lista negra e dígitos verificadores). */
  static create(raw: string): Cpf | null {
    const digits = raw.replace(/\D/g, '');
    return digits.length === 11 && cpfValidator.isValid(digits, true)
      ? new Cpf(digits)
      : null;
  }

  /** Padrão de mercado: só os 6 dígitos do meio aparecem (***.456.789-**). */
  get masked(): string {
    return `***.${this.value.slice(3, 6)}.${this.value.slice(6, 9)}-**`;
  }
}
