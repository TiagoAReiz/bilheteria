import { HttpStatus, RequestMethod } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { handlerOf, type MockPort } from '../../../../../utils/mocks.js';
import { FavoriteController } from '../../../../../../src/modules/favorite/adapters/inbound/controllers/favorite.controller.js';
import type { FavoriteServicePort } from '../../../../../../src/modules/favorite/application/ports/inbound/services/favorite.service.port.js';

const session = { user: { id: 'user-1' } } as unknown as UserSession;

describe('FavoriteController', () => {
  let service: MockPort<FavoriteServicePort>;
  let controller: FavoriteController;

  beforeEach(() => {
    service = {
      favorite: vi.fn().mockResolvedValue(undefined),
      unfavorite: vi.fn().mockResolvedValue(undefined),
      listFavorites: vi.fn().mockResolvedValue([]),
    };
    controller = new FavoriteController(service);
  });

  it.each([
    ['favorite', RequestMethod.PUT, 'events/:id/favorite'],
    ['unfavorite', RequestMethod.DELETE, 'events/:id/favorite'],
  ] as const)('%s: %s %s com 204', (method, verb, path) => {
    const handler = handlerOf(FavoriteController, method);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(verb);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
      HttpStatus.NO_CONTENT,
    );
  });

  it('GET /favorites lista os do usuário da sessão', async () => {
    const handler = handlerOf(FavoriteController, 'list');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('favorites');

    await controller.list(session);
    expect(service.listFavorites).toHaveBeenCalledWith('user-1');
  });

  it('favorita e desfavorita em nome do usuário da sessão', async () => {
    await controller.favorite(session, 10);
    await controller.unfavorite(session, 10);
    expect(service.favorite).toHaveBeenCalledWith('user-1', 10);
    expect(service.unfavorite).toHaveBeenCalledWith('user-1', 10);
  });
});
