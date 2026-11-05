// o Nest normalmente carrega o polyfill; aqui os DTOs são importados isolados
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ConfirmImageUploadDto,
  CreateImageUploadDto,
} from '../../../../../src/modules/storage/adapters/dto/image-upload-dto.js';
import { ReorderEventPhotosDto } from '../../../../../src/modules/event/adapters/dto/reorder-event-photos-dto.js';

const errorsOf = async <T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
) => {
  const errors = await validate(plainToInstance(cls, body));
  return Object.fromEntries(
    errors.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
  );
};

describe('CreateImageUploadDto', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'aceita %s',
    async (content_type) => {
      await expect(
        errorsOf(CreateImageUploadDto, { content_type }),
      ).resolves.toEqual({});
    },
  );

  it.each(['image/gif', 'image/svg+xml', 'IMAGE/PNG', '', undefined, 1])(
    'rejeita %j',
    async (content_type) => {
      const errors = await errorsOf(CreateImageUploadDto, { content_type });
      expect(errors.content_type).toEqual(['isIn']);
    },
  );
});

describe('ConfirmImageUploadDto', () => {
  it('aceita a chave', async () => {
    await expect(
      errorsOf(ConfirmImageUploadDto, { key: 'events/1/cover/a.png' }),
    ).resolves.toEqual({});
  });

  it.each([undefined, '', 7, 'a'.repeat(513)])(
    'rejeita key %j',
    async (key) => {
      const errors = await errorsOf(ConfirmImageUploadDto, { key });
      expect(Object.keys(errors)).toEqual(['key']);
    },
  );
});

describe('ReorderEventPhotosDto', () => {
  it('aceita ids inteiros positivos distintos', async () => {
    await expect(
      errorsOf(ReorderEventPhotosDto, { photo_ids: [3, 1, 2] }),
    ).resolves.toEqual({});
    await expect(
      errorsOf(ReorderEventPhotosDto, { photo_ids: [] }),
    ).resolves.toEqual({});
  });

  it.each([
    [[1, 1], 'arrayUnique'],
    [[0], 'min'],
    [[1.5], 'isInt'],
    [['1'], 'isInt'],
    [Array.from({ length: 11 }, (_, i) => i + 1), 'arrayMaxSize'],
    ['1,2', 'isArray'],
  ])('rejeita %j', async (photo_ids, constraint) => {
    const errors = await errorsOf(ReorderEventPhotosDto, { photo_ids });
    expect(errors.photo_ids).toContain(constraint);
  });
});
