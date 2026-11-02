export class Cpf {
    private constructor(readonly value: string) {}

    static create(raw: string): Cpf | null {
        const digits = raw.replace(/\D/g, '');
        return Cpf.isValid(digits) ? new Cpf(digits) : null;
    }

    private static isValid(digits: string): boolean {
        if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
            return false;
        }
        const checkDigit = (length: number) => {
            let sum = 0;
            for (let i = 0; i < length; i++) {
                sum += Number(digits[i]) * (length + 1 - i);
            }
            const rest = (sum * 10) % 11;
            return rest === 10 ? 0 : rest;
        };
        return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
    }
}
