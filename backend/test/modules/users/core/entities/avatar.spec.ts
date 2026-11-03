import { resolveAvatarUrl } from '../../../../../src/modules/users/core/entities/avatar.js';

const url = (key: string) => `https://cdn.test/${key}`;

describe('resolveAvatarUrl', () => {
  it('avatar enviado tem prioridade sobre a foto do Google', () => {
    expect(resolveAvatarUrl({ avatarKey: 'users/u/avatar/a.png', image: 'https://google/foto.jpg' }, url)).toBe(
      'https://cdn.test/users/u/avatar/a.png',
    );
  });

  it('sem avatar enviado, usa a foto do provedor', () => {
    expect(resolveAvatarUrl({ avatarKey: null, image: 'https://google/foto.jpg' }, url)).toBe('https://google/foto.jpg');
    expect(resolveAvatarUrl({ image: 'https://google/foto.jpg' }, url)).toBe('https://google/foto.jpg');
  });

  it('sem nenhum dos dois: null', () => {
    expect(resolveAvatarUrl({ avatarKey: null, image: null }, url)).toBeNull();
    expect(resolveAvatarUrl({}, url)).toBeNull();
  });
});
