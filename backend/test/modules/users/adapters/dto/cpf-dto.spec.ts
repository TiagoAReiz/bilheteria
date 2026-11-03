// o Nest normalmente carrega o polyfill; aqui o DTO e importado isolado
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CpfDto } from '../../../../../src/modules/users/adapters/dto/cpf-dto.js';

const validateBody = (body: Record<string, unknown>) =>
  validate(plainToInstance(CpfDto, body));

describe('CpfDto', () => {
  it.each(['529.982.247-25', '52998224725'])('aceita %s', async (cpf) => {
    await expect(validateBody({ cpf })).resolves.toHaveLength(0);
  });

  // a cpf-cnpj-validator barra o CPF já no DTO (400 com mensagem de validação)
  it.each(['000', '52998224724', '11111111111', '123.456.789-00'])(
    'rejeita CPF inválido: %s',
    async (cpf) => {
      const errors = await validateBody({ cpf });
      expect(errors).toHaveLength(1);
      expect(Object.values(errors[0].constraints ?? {})).toContain('CPF inválido');
    },
  );

  it('rejeita cpf ausente', async () => {
    const errors = await validateBody({});
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('cpf');
    expect(errors[0].constraints).toHaveProperty('isString');
  });

  it.each([52998224725, null, ['52998224725']])(
    'rejeita cpf que não é string: %j',
    async (cpf) => {
      const errors = await validateBody({ cpf });
      expect(errors[0].constraints).toHaveProperty('isString');
    },
  );
});
