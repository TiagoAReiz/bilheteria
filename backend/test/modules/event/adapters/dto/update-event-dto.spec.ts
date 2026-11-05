import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateEventDto } from '../../../../../src/modules/event/adapters/dto/update-event-dto.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');

async function errorsFor(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(UpdateEventDto, body));
  return Object.fromEntries(
    errors.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
  );
}

describe('UpdateEventDto', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aceita body vazio e campos parciais', async () => {
    expect(await errorsFor({})).toEqual({});
    expect(await errorsFor({ name: 'Novo', max_tickets_per_cpf: 5 })).toEqual(
      {},
    );
  });

  it('"" ou null apagam a descrição', async () => {
    expect(
      plainToInstance(UpdateEventDto, { description: '' }).description,
    ).toBeNull();
    expect(await errorsFor({ description: null })).toEqual({});
    expect(await errorsFor({ description: 3 })).toHaveProperty('description');
  });

  it.each([
    ['name', ''],
    ['location', ''],
    ['starts_at', '2026-01-01T00:00:00.000Z'],
    ['capacity', 0],
    ['price_cents', 50],
    ['max_tickets_per_cpf', 0],
    ['max_tickets_per_cpf', 11],
  ])('recusa %s = %p', async (field, value) => {
    expect(await errorsFor({ [field]: value })).toHaveProperty(field);
  });
});
