// o Nest normalmente carrega o polyfill; aqui o DTO e importado isolado
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEventDto } from '../../../../../src/modules/event/adapters/dto/create-event-dto.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');

const validBody = () => ({
  name: 'Show',
  description: 'Uma noite de rock',
  location: 'Arena',
  starts_at: '2026-07-01T20:00:00.000Z',
  capacity: 100,
  price_cents: 5000,
  max_tickets_per_cpf: 2,
});

async function errorsFor(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateEventDto, body);
  const errors = await validate(dto);
  return Object.fromEntries(
    errors.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
  );
}

describe('CreateEventDto', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aceita um body válido e converte starts_at para Date', async () => {
    const dto = plainToInstance(CreateEventDto, validBody());
    expect(dto.starts_at).toBeInstanceOf(Date);
    expect(dto.starts_at.toISOString()).toBe('2026-07-01T20:00:00.000Z');
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('description é opcional', async () => {
    const { description: _description, ...body } = validBody();
    await expect(errorsFor(body)).resolves.toEqual({});
  });

  it('description, se enviada, precisa ser string', async () => {
    await expect(
      errorsFor({ ...validBody(), description: 123 }),
    ).resolves.toEqual({ description: ['isString'] });
  });

  it.each(['name', 'location', 'starts_at', 'capacity', 'price_cents'])(
    'campo obrigatório ausente: %s',
    async (field) => {
      const body: Record<string, unknown> = validBody();
      delete body[field];
      const errors = await errorsFor(body);
      expect(Object.keys(errors)).toEqual([field]);
    },
  );

  it.each(['name', 'location'])('%s não pode ser vazio', async (field) => {
    const errors = await errorsFor({ ...validBody(), [field]: '' });
    expect(errors[field]).toContain('isNotEmpty');
  });

  describe('starts_at', () => {
    it('rejeita data no passado com a mensagem do DTO', async () => {
      const dto = plainToInstance(CreateEventDto, {
        ...validBody(),
        starts_at: '2026-06-15T11:59:59.000Z',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toEqual({
        minDate: 'starts_at deve ser uma data futura',
      });
    });

    it('a data mínima é avaliada no momento da validação', async () => {
      const dto = plainToInstance(CreateEventDto, {
        ...validBody(),
        starts_at: '2026-06-15T13:00:00.000Z',
      });
      await expect(validate(dto)).resolves.toHaveLength(0);

      vi.setSystemTime(new Date('2026-06-15T14:00:00.000Z'));
      await expect(validate(dto)).resolves.toHaveLength(1);
    });

    it('rejeita data inválida', async () => {
      const errors = await errorsFor({ ...validBody(), starts_at: 'amanhã' });
      expect(errors.starts_at).toContain('isDate');
    });
  });

  describe('capacity', () => {
    it.each([1, 100000])('aceita o limite %d', async (capacity) => {
      await expect(
        errorsFor({ ...validBody(), capacity, max_tickets_per_cpf: 1 }),
      ).resolves.toEqual({});
    });

    it.each([
      [0, 'min'],
      [-5, 'min'],
      [100001, 'max'],
      [1.5, 'isInt'],
    ])('rejeita %d (%s)', async (capacity, constraint) => {
      const errors = await errorsFor({ ...validBody(), capacity });
      expect(errors.capacity).toContain(constraint);
    });

    // sem @Type(() => Number) e sem enableImplicitConversion no ValidationPipe,
    // capacity enviada como string ("10") e rejeitada
    it('rejeita capacity como string numérica', async () => {
      const errors = await errorsFor({ ...validBody(), capacity: '10' });
      expect(errors.capacity).toContain('isInt');
    });
  });

  describe('price_cents', () => {
    it.each([100, 5000, 10_000_000])(
      'aceita %d centavos',
      async (price_cents) => {
        await expect(
          errorsFor({ ...validBody(), price_cents }),
        ).resolves.toEqual({});
      },
    );

    it.each([
      [0, 'min'],
      [-100, 'min'],
      [99, 'min'],
      [10_000_001, 'max'],
      [50.5, 'isInt'],
    ])('rejeita %d (%s)', async (price_cents, constraint) => {
      const errors = await errorsFor({ ...validBody(), price_cents });
      expect(errors.price_cents).toContain(constraint);
    });

    // dinheiro só como inteiro de centavos: string ou reais com vírgula não passam
    it.each(['5000', '50,00', null])('rejeita %j', async (price_cents) => {
      const errors = await errorsFor({ ...validBody(), price_cents });
      expect(errors.price_cents).toContain('isInt');
    });
  });

  describe('max_tickets_per_cpf', () => {
    it('é obrigatório', async () => {
      const { max_tickets_per_cpf, ...body } = validBody();
      expect(await errorsFor(body)).toHaveProperty('max_tickets_per_cpf');
    });

    it.each([0, 11, 1.5, '2'])('recusa %p', async (value) => {
      expect(
        await errorsFor({ ...validBody(), max_tickets_per_cpf: value }),
      ).toHaveProperty('max_tickets_per_cpf');
    });

    it.each([1, 10])('aceita %p', async (value) => {
      expect(
        await errorsFor({ ...validBody(), max_tickets_per_cpf: value }),
      ).toEqual({});
    });

    it('não pode passar da capacidade', async () => {
      expect(
        await errorsFor({
          ...validBody(),
          capacity: 3,
          max_tickets_per_cpf: 4,
        }),
      ).toEqual({ max_tickets_per_cpf: ['notAboveCapacity'] });
      expect(
        await errorsFor({
          ...validBody(),
          capacity: 3,
          max_tickets_per_cpf: 3,
        }),
      ).toEqual({});
    });
  });
});
