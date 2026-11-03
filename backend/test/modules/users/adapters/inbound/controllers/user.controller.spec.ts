import { RequestMethod } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { handlerOf, type MockPort } from '../../../../../utils/mocks.js';
import { UserController } from '../../../../../../src/modules/users/adapters/inbound/controllers/user.controller.js';
import {
  USER_SERVICE,
  type UserServicePort,
} from '../../../../../../src/modules/users/application/ports/inbound/services/user.service.port.js';

const PUBLIC_KEY = 'PUBLIC';
const ROLES_KEY = 'ROLES';

const session = {
  user: { id: 'user-1', name: 'Tiago', email: 't@example.com', role: 'USER' },
  session: { id: 'sess-1' },
} as unknown as UserSession;

describe('UserController', () => {
  let controller: UserController;
  let userService: MockPort<UserServicePort>;
  const reflector = new Reflector();

  beforeEach(async () => {
    userService = {
      registerCpf: vi.fn(),
      hasCpf: vi.fn(),
      becomeOrganizer: vi.fn(),
      createAvatarUpload: vi.fn(),
      confirmAvatar: vi.fn(),
      removeAvatar: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: USER_SERVICE, useValue: userService }],
    }).compile();

    controller = module.get(UserController);
  });

  it('está montado em /users e nenhuma rota é pública', () => {
    expect(Reflect.getMetadata(PATH_METADATA, UserController)).toBe('users');
    for (const handler of [
      handlerOf(UserController, 'me'),
      handlerOf(UserController, 'registerCpf'),
      handlerOf(UserController, 'becomeOrganizer'),
      handlerOf(UserController, 'createAvatarUpload'),
      handlerOf(UserController, 'confirmAvatar'),
      handlerOf(UserController, 'removeAvatar'),
    ]) {
      expect(reflector.get(PUBLIC_KEY, handler)).toBeUndefined();
      expect(reflector.get(ROLES_KEY, handler)).toBeUndefined();
    }
  });

  describe('me', () => {
    it('retorna o usuário da sessão com hasCpf', async () => {
      userService.hasCpf.mockResolvedValue(true);
      await expect(controller.me(session)).resolves.toEqual({
        ...session.user,
        hasCpf: true,
      });
      expect(userService.hasCpf).toHaveBeenCalledWith('user-1');
      expect(userService.registerCpf).not.toHaveBeenCalled();
    });

    it('hasCpf false quando a conta ainda não tem CPF', async () => {
      userService.hasCpf.mockResolvedValue(false);
      await expect(controller.me(session)).resolves.toMatchObject({ hasCpf: false });
    });

    it('é mapeada em GET /users/me', () => {
      const handler = handlerOf(UserController, 'me');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('me');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );
    });
  });

  describe('registerCpf', () => {
    it('chama registerCpf com o id da sessão e o cpf do body', async () => {
      userService.registerCpf.mockResolvedValue(undefined);

      await expect(
        controller.registerCpf(session, { cpf: '529.982.247-25' }),
      ).resolves.toBeUndefined();
      expect(userService.registerCpf).toHaveBeenCalledWith(
        'user-1',
        '529.982.247-25',
      );
    });

    it('é mapeada em PATCH /users/me/cpf com 204', () => {
      const handler = handlerOf(UserController, 'registerCpf');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('me/cpf');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.PATCH,
      );
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(204);
    });
  });

  describe('becomeOrganizer', () => {
    it('chama becomeOrganizer com o id da sessão', async () => {
      userService.becomeOrganizer.mockResolvedValue(undefined);

      await expect(
        controller.becomeOrganizer(session),
      ).resolves.toBeUndefined();
      expect(userService.becomeOrganizer).toHaveBeenCalledWith('user-1');
    });

    it('é mapeada em PATCH /users/me/organizer com 204', () => {
      const handler = handlerOf(UserController, 'becomeOrganizer');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('me/organizer');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.PATCH,
      );
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(204);
    });
  });

  describe('avatar', () => {
    it.each([
      ['createAvatarUpload', RequestMethod.POST, 'me/avatar/upload-url'],
      ['confirmAvatar', RequestMethod.PUT, 'me/avatar'],
      ['removeAvatar', RequestMethod.DELETE, 'me/avatar'],
    ] as const)('%s: %s /users/%s', (method, verb, path) => {
      const handler = handlerOf(UserController, method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(verb);
    });

    it('sempre usa o id da sessão', async () => {
      await controller.createAvatarUpload(session, { content_type: 'image/webp' });
      await controller.confirmAvatar(session, { key: 'k' });
      await controller.removeAvatar(session);
      expect(userService.createAvatarUpload).toHaveBeenCalledWith('user-1', 'image/webp');
      expect(userService.confirmAvatar).toHaveBeenCalledWith('user-1', 'k');
      expect(userService.removeAvatar).toHaveBeenCalledWith('user-1');
    });
  });
});
