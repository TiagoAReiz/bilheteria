import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MockPort } from '../../../../utils/mocks.js';
import { UserService } from '../../../../../src/modules/users/application/services/user.service.js';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../../../../src/modules/users/application/ports/outbound/repositories/user.repository.port.js';
import {
  CPF_HASHER,
  type CpfHasherPort,
} from '../../../../../src/modules/users/application/ports/outbound/crypto/cpf-hasher.port.js';
import { Cpf } from '../../../../../src/modules/users/core/entities/cpf.js';
import { IMAGE_STORAGE_SERVICE } from '../../../../../src/modules/storage/application/ports/inbound/services/image-storage.service.port.js';
import {
  mockImageStorage,
  PUBLIC_BASE,
} from '../../../../utils/image-storage.js';

describe('UserService', () => {
  let service: UserService;
  let userRepository: MockPort<UserRepositoryPort>;
  let cpfHasher: MockPort<CpfHasherPort>;
  let images: ReturnType<typeof mockImageStorage>;

  beforeEach(async () => {
    userRepository = {
      getCpfById: vi.fn(),
      setCpfIfEmpty: vi.fn(),
      promoteToOrganizer: vi.fn(),
      replaceAvatarKey: vi.fn(),
    };
    cpfHasher = { hash: vi.fn().mockReturnValue('hashed-cpf') };
    images = mockImageStorage();

    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: USER_REPOSITORY, useValue: userRepository },
        { provide: CPF_HASHER, useValue: cpfHasher },
        { provide: IMAGE_STORAGE_SERVICE, useValue: images },
      ],
    }).compile();

    service = module.get(UserService);
  });

  describe('registerCpf', () => {
    it('lança BadRequest para CPF inválido sem tocar no hasher nem no repositório', async () => {
      await expect(
        service.registerCpf('user-1', '123.456.789-00'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(cpfHasher.hash).not.toHaveBeenCalled();
      expect(userRepository.setCpfIfEmpty).not.toHaveBeenCalled();
    });

    it('lança Conflict quando o usuário já tem CPF cadastrado', async () => {
      userRepository.setCpfIfEmpty.mockResolvedValue(false);

      await expect(
        service.registerCpf('user-1', '529.982.247-25'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('faz o hash do CPF normalizado e grava com setCpfIfEmpty', async () => {
      userRepository.setCpfIfEmpty.mockResolvedValue(true);

      await expect(
        service.registerCpf('user-1', '529.982.247-25'),
      ).resolves.toBeUndefined();

      expect(cpfHasher.hash).toHaveBeenCalledTimes(1);
      const cpfArg = cpfHasher.hash.mock.calls[0][0];
      expect(cpfArg).toBeInstanceOf(Cpf);
      expect(cpfArg.value).toBe('52998224725');
      expect(userRepository.setCpfIfEmpty).toHaveBeenCalledWith(
        'user-1',
        'hashed-cpf',
        '***.982.247-**',
      );
    });

    it('propaga o Conflict do repositório (CPF vinculado a outra conta)', async () => {
      userRepository.setCpfIfEmpty.mockRejectedValue(
        new ConflictException('Este CPF já está vinculado a outra conta'),
      );

      await expect(
        service.registerCpf('user-1', '52998224725'),
      ).rejects.toThrow('Este CPF já está vinculado a outra conta');
    });
  });

  describe('hasCpf', () => {
    it('retorna true quando existe hash', async () => {
      userRepository.getCpfById.mockResolvedValue({
        cpfHash: 'abc',
        cpfMasked: '***.982.247-**',
      });
      await expect(service.hasCpf('user-1')).resolves.toBe(true);
      expect(userRepository.getCpfById).toHaveBeenCalledWith('user-1');
    });

    it('retorna false quando o hash é null', async () => {
      userRepository.getCpfById.mockResolvedValue({
        cpfHash: null,
        cpfMasked: null,
      });
      await expect(service.hasCpf('user-1')).resolves.toBe(false);
    });
  });

  describe('getCpfStatus', () => {
    it('devolve o CPF mascarado quando cadastrado', async () => {
      userRepository.getCpfById.mockResolvedValue({
        cpfHash: 'abc',
        cpfMasked: '***.982.247-**',
      });
      await expect(service.getCpfStatus('user-1')).resolves.toEqual({
        hasCpf: true,
        cpfMasked: '***.982.247-**',
      });
    });

    it('conta antiga (só hash) tem CPF mas sem mascarado', async () => {
      userRepository.getCpfById.mockResolvedValue({
        cpfHash: 'abc',
        cpfMasked: null,
      });
      await expect(service.getCpfStatus('user-1')).resolves.toEqual({
        hasCpf: true,
        cpfMasked: null,
      });
    });

    it('sem CPF', async () => {
      userRepository.getCpfById.mockResolvedValue({
        cpfHash: null,
        cpfMasked: null,
      });
      await expect(service.getCpfStatus('user-1')).resolves.toEqual({
        hasCpf: false,
        cpfMasked: null,
      });
    });
  });

  describe('becomeOrganizer', () => {
    it('delega para promoteToOrganizer com o id do usuário', async () => {
      userRepository.promoteToOrganizer.mockResolvedValue(undefined);
      await expect(service.becomeOrganizer('user-1')).resolves.toBeUndefined();
      expect(userRepository.promoteToOrganizer).toHaveBeenCalledWith('user-1');
    });
  });

  describe('avatar', () => {
    const KEY = 'users/user-1/avatar/0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f.png';
    const OLD = 'users/user-1/avatar/11111111-1d2a-4c3b-9e8f-7a6b5c4d3e2f.jpg';

    it('createAvatarUpload usa o prefixo do próprio usuário', async () => {
      await service.createAvatarUpload('user-1', 'image/png');
      expect(images.createUpload).toHaveBeenCalledWith(
        'user_avatar',
        'users/user-1/avatar',
        'image/png',
      );
    });

    it('confirmAvatar valida no prefixo do usuário, grava e apaga o avatar anterior', async () => {
      userRepository.replaceAvatarKey.mockResolvedValue({
        previousKey: OLD,
        image: 'https://google/foto.jpg',
      });

      await expect(service.confirmAvatar('user-1', KEY)).resolves.toEqual({
        avatar_url: `${PUBLIC_BASE}/${KEY}`,
      });
      expect(images.confirmUpload).toHaveBeenCalledWith(
        'user_avatar',
        'users/user-1/avatar',
        KEY,
      );
      expect(userRepository.replaceAvatarKey).toHaveBeenCalledWith(
        'user-1',
        KEY,
      );
      expect(images.deleteQuietly).toHaveBeenCalledWith('user_avatar', OLD);
    });

    it('primeiro avatar (só a foto do Google antes): nada para apagar', async () => {
      userRepository.replaceAvatarKey.mockResolvedValue({
        previousKey: null,
        image: 'https://google/foto.jpg',
      });
      await service.confirmAvatar('user-1', KEY);
      // a foto do Google não é nossa: nunca vai para o deleteQuietly (null é ignorado por ele)
      expect(images.deleteQuietly).not.toHaveBeenCalledWith(
        'user_avatar',
        expect.any(String),
      );
    });

    it('confirmação repetida da mesma chave não apaga o próprio avatar', async () => {
      userRepository.replaceAvatarKey.mockResolvedValue({
        previousKey: KEY,
        image: null,
      });
      await service.confirmAvatar('user-1', KEY);
      expect(images.deleteQuietly).not.toHaveBeenCalled();
    });

    it('upload inválido (ex.: chave de outro usuário) não grava nada', async () => {
      images.confirmUpload.mockRejectedValue(
        new BadRequestException('Chave de upload inválida'),
      );
      await expect(
        service.confirmAvatar(
          'user-1',
          'users/user-2/avatar/0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f.png',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(userRepository.replaceAvatarKey).not.toHaveBeenCalled();
    });

    it('removeAvatar volta para a foto do provedor e apaga o objeto', async () => {
      userRepository.replaceAvatarKey.mockResolvedValue({
        previousKey: OLD,
        image: 'https://google/foto.jpg',
      });

      await expect(service.removeAvatar('user-1')).resolves.toEqual({
        avatar_url: 'https://google/foto.jpg',
      });
      expect(userRepository.replaceAvatarKey).toHaveBeenCalledWith(
        'user-1',
        null,
      );
      expect(images.deleteQuietly).toHaveBeenCalledWith('user_avatar', OLD);
    });

    it('removeAvatar sem foto do provedor: avatar_url null (iniciais no front)', async () => {
      userRepository.replaceAvatarKey.mockResolvedValue({
        previousKey: null,
        image: null,
      });
      await expect(service.removeAvatar('user-1')).resolves.toEqual({
        avatar_url: null,
      });
    });
  });
});
