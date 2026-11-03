// o Nest normalmente carrega o polyfill; aqui os DTOs são importados isolados
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCheckoutDto } from '../../../../../src/modules/payment/adapters/dto/create-checkout-dto.js';
import { MercadoPagoNotificationQueryDto } from '../../../../../src/modules/payment/adapters/dto/mercadopago-notification-dto.js';

const errorsOf = async <T extends object>(cls: new () => T, body: Record<string, unknown>) => {
  const errors = await validate(plainToInstance(cls, body));
  return Object.fromEntries(errors.map((e) => [e.property, Object.keys(e.constraints ?? {})]));
};

describe('CreateCheckoutDto', () => {
  it('aceita ticket_id inteiro positivo', async () => {
    await expect(errorsOf(CreateCheckoutDto, { ticket_id: 7 })).resolves.toEqual({});
  });

  it.each([
    [0, 'min'],
    [-1, 'min'],
    [1.5, 'isInt'],
    ['7', 'isInt'],
    [undefined, 'isInt'],
  ])('rejeita ticket_id %j', async (ticket_id, constraint) => {
    const errors = await errorsOf(CreateCheckoutDto, { ticket_id });
    expect(errors.ticket_id).toContain(constraint);
  });
});

describe('MercadoPagoNotificationQueryDto', () => {
  it('aceita a query da notificação de order', async () => {
    await expect(
      errorsOf(MercadoPagoNotificationQueryDto, { 'data.id': 'ORDTST01KS5AJ6HTK2HRQ3XJ3C2JCKP9', type: 'order' }),
    ).resolves.toEqual({});
  });

  it.each([undefined, '', '../../x', 'a'.repeat(65), 'ORD 1'])('rejeita data.id %j', async (id) => {
    const errors = await errorsOf(MercadoPagoNotificationQueryDto, { 'data.id': id });
    expect(Object.keys(errors)).toEqual(['data.id']);
  });
});
