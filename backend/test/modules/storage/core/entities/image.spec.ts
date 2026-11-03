import {
  IMAGE_CONTENT_TYPES,
  buildImageKey,
  contentTypeOfKey,
  imagePrefixes,
  isImageContentType,
  isImageKeyUnder,
  matchesImageSignature,
} from '../../../../../src/modules/storage/core/entities/image.js';

const UUID = '0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const WEBP = new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBP');

describe('regras das imagens', () => {
  it('aceita só jpeg, png e webp', () => {
    expect(Object.keys(IMAGE_CONTENT_TYPES)).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(isImageContentType('image/png')).toBe(true);
    expect(isImageContentType('image/gif')).toBe(false);
    expect(isImageContentType('image/svg+xml')).toBe(false);
    expect(isImageContentType('toString')).toBe(false);
    expect(isImageContentType(undefined)).toBe(false);
  });

  it('a chave é prefixo + uuid + extensão do tipo (nunca o nome do arquivo do cliente)', () => {
    expect(buildImageKey('events/3/cover', 'image/jpeg', UUID)).toBe(`events/3/cover/${UUID}.jpg`);
    expect(buildImageKey('users/u1/avatar', 'image/webp', UUID)).toBe(`users/u1/avatar/${UUID}.webp`);
  });

  it('prefixos por recurso', () => {
    expect(imagePrefixes.eventCover(3)).toBe('events/3/cover');
    expect(imagePrefixes.eventPhotos(3)).toBe('events/3/photos');
    expect(imagePrefixes.userAvatar('abc')).toBe('users/abc/avatar');
    expect(imagePrefixes.userAvatar('a/../b')).toBe('users/a%2F..%2Fb/avatar');
  });

  describe('isImageKeyUnder', () => {
    it('aceita a chave gerada para o mesmo prefixo', () => {
      expect(isImageKeyUnder('events/3/cover', `events/3/cover/${UUID}.png`)).toBe(true);
    });

    it.each([
      ['outro evento', `events/4/cover/${UUID}.png`],
      ['prefixo que só começa igual', `events/33/cover/${UUID}.png`],
      ['outro tipo de imagem do mesmo evento', `events/3/photos/${UUID}.png`],
      ['subpasta', `events/3/cover/x/${UUID}.png`],
      ['extensão fora da lista', `events/3/cover/${UUID}.svg`],
      ['sem uuid', 'events/3/cover/foto.png'],
      ['path traversal', `events/3/cover/../../users/u/avatar/${UUID}.png`],
      ['não string', 42],
    ])('recusa %s', (_case, key) => {
      expect(isImageKeyUnder('events/3/cover', key)).toBe(false);
    });

    it('trata o prefixo como texto literal (sem regex)', () => {
      expect(isImageKeyUnder('users/a.b/avatar', `users/aXb/avatar/${UUID}.png`)).toBe(false);
    });
  });

  it('tipo esperado pela extensão da chave', () => {
    expect(contentTypeOfKey(`a/${UUID}.jpg`)).toBe('image/jpeg');
    expect(contentTypeOfKey(`a/${UUID}.png`)).toBe('image/png');
    expect(contentTypeOfKey(`a/${UUID}.webp`)).toBe('image/webp');
    expect(contentTypeOfKey(`a/${UUID}.gif`)).toBeNull();
  });

  describe('matchesImageSignature', () => {
    it('reconhece os magic numbers', () => {
      expect(matchesImageSignature('image/png', PNG)).toBe(true);
      expect(matchesImageSignature('image/jpeg', JPEG)).toBe(true);
      expect(matchesImageSignature('image/webp', WEBP)).toBe(true);
    });

    it('recusa formato trocado, texto e arquivo curto', () => {
      expect(matchesImageSignature('image/png', JPEG)).toBe(false);
      expect(matchesImageSignature('image/jpeg', PNG)).toBe(false);
      expect(matchesImageSignature('image/webp', PNG)).toBe(false);
      expect(matchesImageSignature('image/png', new TextEncoder().encode('<html><script>'))).toBe(false);
      expect(matchesImageSignature('image/jpeg', new Uint8Array([0xff]))).toBe(false);
      expect(matchesImageSignature('image/png', new Uint8Array())).toBe(false);
    });
  });
});
