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

describe('UserService', () => {
  let service: UserService;
  let userRepository: MockPort<UserRepositoryPort>;
  let cpfHasher: MockPort<CpfHasherPort>;

  beforeEach(async () => {
    userRepository = {
      getCpfHashById: vi.fn(),
      setCpfHashIfEmpty: vi.fn(),
      promoteToOrganizer: vi.fn(),
    };
    cpfHasher = { hash: vi.fn().mockReturnValue('hashed-cpf') };

    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: USER_REPOSITORY, useValue: userRepository },
        { provide: CPF_HASHER, useValue: cpfHasher },
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
      expect(userRepository.setCpfHashIfEmpty).not.toHaveBeenCalled();
    });

    it('lança Conflict quando o usuário já tem CPF cadastrado', async () => {
      userRepository.setCpfHashIfEmpty.mockResolvedValue(false);

      await expect(
        service.registerCpf('user-1', '529.982.247-25'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('faz o hash do CPF normalizado e grava com setCpfHashIfEmpty', async () => {
      userRepository.setCpfHashIfEmpty.mockResolvedValue(true);

      await expect(
        service.registerCpf('user-1', '529.982.247-25'),
      ).resolves.toBeUndefined();

      expect(cpfHasher.hash).toHaveBeenCalledTimes(1);
      const cpfArg = cpfHasher.hash.mock.calls[0][0];
      expect(cpfArg).toBeInstanceOf(Cpf);
      expect(cpfArg.value).toBe('52998224725');
      expect(userRepository.setCpfHashIfEmpty).toHaveBeenCalledWith(
        'user-1',
        'hashed-cpf',
      );
    });

    it('propaga o Conflict do repositório (CPF vinculado a outra conta)', async () => {
      userRepository.setCpfHashIfEmpty.mockRejectedValue(
        new ConflictException('Este CPF já está vinculado a outra conta'),
      );

      await expect(
        service.registerCpf('user-1', '52998224725'),
      ).rejects.toThrow('Este CPF já está vinculado a outra conta');
    });
  });

  describe('hasCpf', () => {
    it('retorna true quando existe hash', async () => {
      userRepository.getCpfHashById.mockResolvedValue('abc');
      await expect(service.hasCpf('user-1')).resolves.toBe(true);
      expect(userRepository.getCpfHashById).toHaveBeenCalledWith('user-1');
    });

    it('retorna false quando o hash é null', async () => {
      userRepository.getCpfHashById.mockResolvedValue(null);
      await expect(service.hasCpf('user-1')).resolves.toBe(false);
    });
  });

  describe('becomeOrganizer', () => {
    it('delega para promoteToOrganizer com o id do usuário', async () => {
      userRepository.promoteToOrganizer.mockResolvedValue(undefined);
      await expect(service.becomeOrganizer('user-1')).resolves.toBeUndefined();
      expect(userRepository.promoteToOrganizer).toHaveBeenCalledWith('user-1');
    });
  });
});
