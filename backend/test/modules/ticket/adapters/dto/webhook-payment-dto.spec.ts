// o Nest normalmente carrega o polyfill; aqui o DTO e importado isolado
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { WebhookDto } from '../../../../../src/modules/ticket/adapters/dto/webhook-payment-dto.js';

const validateBody = async (body: Record<string, unknown>) => {
  const errors = await validate(plainToInstance(WebhookDto, body));
  return Object.fromEntries(
    errors.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
  );
};

describe('WebhookDto', () => {
  it('aceita id inteiro e user_id string', async () => {
    await expect(validateBody({ id: 1, user_id: 'user-1' })).resolves.toEqual(
      {},
    );
  });

  it('rejeita body vazio apontando os dois campos', async () => {
    await expect(validateBody({})).resolves.toEqual({
      id: ['isInt'],
      user_id: ['isString'],
    });
  });

  it.each([1.2, '1', null])('rejeita id não inteiro: %j', async (id) => {
    const errors = await validateBody({ id, user_id: 'user-1' });
    expect(errors).toEqual({ id: ['isInt'] });
  });

  it.each([123, null, {}])(
    'rejeita user_id que não é string: %j',
    async (user_id) => {
      const errors = await validateBody({ id: 1, user_id });
      expect(errors).toEqual({ user_id: ['isString'] });
    },
  );

  // sem @IsNotEmpty: string vazia passa no DTO (e cai no "nao pertence ao usuario" do service)
  it('aceita user_id vazio (sem @IsNotEmpty)', async () => {
    await expect(validateBody({ id: 1, user_id: '' })).resolves.toEqual({});
  });
});
