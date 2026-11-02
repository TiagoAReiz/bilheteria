// o Nest normalmente carrega o polyfill; aqui o DTO e importado isolado
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReservationDto } from '../../../../../src/modules/ticket/adapters/dto/reservation-dto.js';

const validateBody = (body: Record<string, unknown>) =>
  validate(plainToInstance(ReservationDto, body));

describe('ReservationDto', () => {
  it('aceita event_id inteiro', async () => {
    await expect(validateBody({ event_id: 10 })).resolves.toHaveLength(0);
  });

  it('rejeita event_id ausente', async () => {
    const errors = await validateBody({});
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('event_id');
    expect(errors[0].constraints).toHaveProperty('isInt');
  });

  it.each([1.5, '10', null, true])(
    'rejeita event_id não inteiro: %j',
    async (event_id) => {
      const errors = await validateBody({ event_id });
      expect(errors[0].constraints).toHaveProperty('isInt');
    },
  );

  // nao ha @IsPositive: ids negativos/zero passam no DTO e caem no 404 do evento
  it('aceita event_id zero ou negativo (sem @IsPositive)', async () => {
    await expect(validateBody({ event_id: 0 })).resolves.toHaveLength(0);
    await expect(validateBody({ event_id: -1 })).resolves.toHaveLength(0);
  });
});
