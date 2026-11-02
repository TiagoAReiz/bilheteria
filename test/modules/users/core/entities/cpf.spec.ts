import { Cpf } from '../../../../../src/modules/users/core/entities/cpf.js';

describe('Cpf', () => {
  describe('CPFs válidos', () => {
    it.each([
      ['529.982.247-25', '52998224725'],
      ['52998224725', '52998224725'],
      ['111.444.777-35', '11144477735'],
      ['11144477735', '11144477735'],
      // primeiro dígito verificador cai no caso "resto 10 -> 0"
      ['123.456.789-09', '12345678909'],
    ])('aceita %s', (raw, expected) => {
      const cpf = Cpf.create(raw);
      expect(cpf).not.toBeNull();
      expect(cpf!.value).toBe(expected);
    });

    it('normaliza removendo qualquer caractere que não seja dígito', () => {
      expect(Cpf.create(' 529 982 247/25 ')!.value).toBe('52998224725');
      expect(Cpf.create('529a982b247c25')!.value).toBe('52998224725');
    });

    it('gera o mesmo valor para entradas com e sem máscara', () => {
      expect(Cpf.create('529.982.247-25')!.value).toBe(
        Cpf.create('52998224725')!.value,
      );
    });
  });

  describe('CPFs inválidos', () => {
    it.each(['529.982.247-24', '529.982.247-15', '52998224735'])(
      'rejeita dígito verificador errado: %s',
      (raw) => {
        expect(Cpf.create(raw)).toBeNull();
      },
    );

    it.each(Array.from({ length: 10 }, (_, d) => String(d).repeat(11)))(
      'rejeita todos os dígitos iguais: %s',
      (raw) => {
        expect(Cpf.create(raw)).toBeNull();
      },
    );

    it('rejeita todos os dígitos iguais mesmo com máscara', () => {
      expect(Cpf.create('111.111.111-11')).toBeNull();
    });

    it.each(['', '5299822472', '529982247250', '529.982.247-2', 'abc'])(
      'rejeita tamanho errado: "%s"',
      (raw) => {
        expect(Cpf.create(raw)).toBeNull();
      },
    );
  });
});
