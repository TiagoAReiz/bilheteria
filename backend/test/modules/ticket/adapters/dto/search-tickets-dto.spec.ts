import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchTicketsDto } from '../../../../../src/modules/ticket/adapters/dto/search-tickets-dto.js';

async function check(query: Record<string, unknown>) {
  const dto = plainToInstance(SearchTicketsDto, query);
  const errors = await validate(dto);
  return {
    dto,
    errors: Object.fromEntries(
      errors.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
    ),
  };
}

describe('SearchTicketsDto', () => {
  it('query vazia usa página 1 e tamanho padrão', async () => {
    const { dto, errors } = await check({});
    expect(errors).toEqual({});
    expect(dto).toMatchObject({ page: 1, size: 20 });
    expect(dto.event_id).toBeUndefined();
  });

  it('converte números da query string', async () => {
    const { dto, errors } = await check({
      event_id: '7',
      page: '2',
      size: '50',
    });
    expect(errors).toEqual({});
    expect(dto).toMatchObject({ event_id: 7, page: 2, size: 50 });
  });

  it.each(['available', 'reserved', 'paid', 'expired'])(
    'aceita status %s',
    async (status) => {
      await expect(check({ status })).resolves.toMatchObject({ errors: {} });
    },
  );

  it('rejeita status desconhecido', async () => {
    const { errors } = await check({ status: 'cancelled' });
    expect(errors.status).toContain('isIn');
  });

  it.each([
    ['event_id', '0', 'min'],
    ['event_id', 'abc', 'isInt'],
    ['size', '101', 'max'],
    ['size', '0', 'min'],
    ['page', '101', 'max'],
  ])('rejeita %s=%s (%s)', async (field, value, constraint) => {
    const { errors } = await check({ [field]: value });
    expect(errors[field]).toContain(constraint);
  });
});
