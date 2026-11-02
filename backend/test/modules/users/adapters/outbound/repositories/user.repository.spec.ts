import type { Mock } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../../../src/generated/prisma/client.js';
import type { PrismaService } from '../../../../../../src/modules/prisma/prisma.service.js';
import { UserRepository } from '../../../../../../src/modules/users/adapters/outbound/repositories/user.repository.js';
import { Role } from '../../../../../../src/modules/users/core/entities/role.js';

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`erro ${code}`, {
    code,
    clientVersion: 'test',
  });

describe('UserRepository', () => {
  let prisma: {
    user: {
      findUnique: Mock;
      updateMany: Mock;
    };
  };
  let repository: UserRepository;

  beforeEach(() => {
    prisma = { user: { findUnique: vi.fn(), updateMany: vi.fn() } };
    repository = new UserRepository(prisma as unknown as PrismaService);
  });

  describe('getCpfHashById', () => {
    it('retorna o cpfHash selecionando só esse campo', async () => {
      prisma.user.findUnique.mockResolvedValue({ cpfHash: 'abc' });

      await expect(repository.getCpfHashById('user-1')).resolves.toBe('abc');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { cpfHash: true },
      });
    });

    it('retorna null quando o usuário existe sem CPF', async () => {
      prisma.user.findUnique.mockResolvedValue({ cpfHash: null });
      await expect(repository.getCpfHashById('user-1')).resolves.toBeNull();
    });

    it('lança NotFound quando o usuário não existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(repository.getCpfHashById('user-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('setCpfHashIfEmpty', () => {
    it('atualiza só se cpfHash for null e retorna true quando count > 0', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        repository.setCpfHashIfEmpty('user-1', 'hash'),
      ).resolves.toBe(true);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', cpfHash: null },
        data: { cpfHash: 'hash' },
      });
    });

    it('retorna false quando nenhuma linha foi atualizada (já tinha CPF)', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.setCpfHashIfEmpty('user-1', 'hash'),
      ).resolves.toBe(false);
    });

    it('mapeia P2002 (unique) para ConflictException', async () => {
      prisma.user.updateMany.mockRejectedValue(knownError('P2002'));

      const promise = repository.setCpfHashIfEmpty('user-1', 'hash');
      await expect(promise).rejects.toBeInstanceOf(ConflictException);
      await expect(promise).rejects.toThrow(
        'Este CPF já está vinculado a outra conta',
      );
    });

    it('repassa outros erros conhecidos do Prisma', async () => {
      const error = knownError('P2025');
      prisma.user.updateMany.mockRejectedValue(error);
      await expect(repository.setCpfHashIfEmpty('user-1', 'hash')).rejects.toBe(
        error,
      );
    });

    it('repassa erros genéricos', async () => {
      const error = new Error('conexão perdida');
      prisma.user.updateMany.mockRejectedValue(error);
      await expect(repository.setCpfHashIfEmpty('user-1', 'hash')).rejects.toBe(
        error,
      );
    });

    it('não confunde um objeto com code P2002 que não é PrismaClientKnownRequestError', async () => {
      const error = Object.assign(new Error('fake'), { code: 'P2002' });
      prisma.user.updateMany.mockRejectedValue(error);
      await expect(repository.setCpfHashIfEmpty('user-1', 'hash')).rejects.toBe(
        error,
      );
    });
  });

  describe('promoteToOrganizer', () => {
    it('promove apenas quem tem role USER', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        repository.promoteToOrganizer('user-1'),
      ).resolves.toBeUndefined();
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', role: Role.USER },
        data: { role: Role.ORGANIZER },
      });
    });

    it('não lança quando nada é atualizado (ADMIN/ORGANIZER/inexistente)', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.promoteToOrganizer('admin-1'),
      ).resolves.toBeUndefined();
    });
  });
});
