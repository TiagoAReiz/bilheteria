import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  SearchEventsDto,
  SuggestEventsDto,
} from '../../../../../src/modules/event/adapters/dto/search-events-dto.js';

async function check<T extends object>(
  cls: new () => T,
  query: Record<string, unknown>,
) {
  const dto = plainToInstance(cls, query);
  const errors = await validate(dto);
  return {
    dto,
    errors: Object.fromEntries(
      errors.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
    ),
  };
}

describe('SearchEventsDto', () => {
  it('query vazia é válida e usa os padrões de paginação', async () => {
    const { dto, errors } = await check(SearchEventsDto, {});
    expect(errors).toEqual({});
    expect(dto).toMatchObject({ page: 1, size: 12 });
    expect(dto.available).toBeUndefined();
  });

  it('converte a query string (números, datas e booleano)', async () => {
    const { dto, errors } = await check(SearchEventsDto, {
      q: '  rock ',
      location: ' São Paulo ',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31',
      available: 'true',
      page: '3',
      size: '24',
    });
    expect(errors).toEqual({});
    expect(dto).toMatchObject({
      q: 'rock',
      location: 'São Paulo',
      available: true,
      page: 3,
      size: 24,
    });
    expect(dto.from).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    expect(dto.to).toBeInstanceOf(Date);
  });

  it('available=false vira false', async () => {
    const { dto } = await check(SearchEventsDto, { available: 'false' });
    expect(dto.available).toBe(false);
  });

  it('q só com espaços é tratado como ausente', async () => {
    const { dto, errors } = await check(SearchEventsDto, { q: '   ' });
    expect(errors).toEqual({});
    expect(dto.q).toBeUndefined();
  });

  it.each([
    ['q', 'x'.repeat(101), 'maxLength'],
    ['location', 'x'.repeat(101), 'maxLength'],
    ['available', 'sim', 'isBoolean'],
    ['from', 'ontem', 'isDate'],
    ['page', '0', 'min'],
    ['page', '201', 'max'],
    ['page', '1.5', 'isInt'],
    ['size', '51', 'max'],
    ['size', 'muitos', 'isInt'],
  ])('rejeita %s=%s (%s)', async (field, value, constraint) => {
    const { errors } = await check(SearchEventsDto, { [field]: value });
    expect(errors[field]).toContain(constraint);
  });

  it('aceita q no limite de 100 caracteres', async () => {
    const { errors } = await check(SearchEventsDto, { q: 'x'.repeat(100) });
    expect(errors).toEqual({});
  });
});

describe('SuggestEventsDto', () => {
  it('aceita um prefixo e tira os espaços', async () => {
    const { dto, errors } = await check(SuggestEventsDto, { q: ' fes ' });
    expect(errors).toEqual({});
    expect(dto.q).toBe('fes');
  });

  it.each([{}, { q: '' }, { q: '   ' }])('exige q (%j)', async (query) => {
    const { errors } = await check(SuggestEventsDto, query);
    expect(Object.keys(errors)).toEqual(['q']);
  });

  it('limita o tamanho de q', async () => {
    const { errors } = await check(SuggestEventsDto, { q: 'x'.repeat(101) });
    expect(errors.q).toContain('maxLength');
  });
});
