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
    $transaction: Mock;
  };
  let tx: { $queryRaw: Mock; user: { update: Mock } };
  let repository: UserRepository;

  beforeEach(() => {
    tx = { $queryRaw: vi.fn(), user: { update: vi.fn() } };
    prisma = {
      user: { findUnique: vi.fn(), updateMany: vi.fn() },
      $transaction: vi.fn((work: (t: typeof tx) => unknown) => work(tx)),
    };
    repository = new UserRepository(prisma as unknown as PrismaService);
  });

  describe('getCpfById', () => {
    it('retorna hash e mascarado selecionando só esses campos', async () => {
      prisma.user.findUnique.mockResolvedValue({
        cpfHash: 'abc',
        cpfMasked: '***.982.247-**',
      });

      await expect(repository.getCpfById('user-1')).resolves.toEqual({
        cpfHash: 'abc',
        cpfMasked: '***.982.247-**',
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { cpfHash: true, cpfMasked: true },
      });
    });

    it('retorna nulos quando o usuário existe sem CPF', async () => {
      prisma.user.findUnique.mockResolvedValue({
        cpfHash: null,
        cpfMasked: null,
      });
      await expect(repository.getCpfById('user-1')).resolves.toEqual({
        cpfHash: null,
        cpfMasked: null,
      });
    });

    it('lança NotFound quando o usuário não existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(repository.getCpfById('user-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('setCpfIfEmpty', () => {
    it('atualiza só se cpfHash for null e retorna true quando count > 0', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        repository.setCpfIfEmpty('user-1', 'hash', '***.982.247-**'),
      ).resolves.toBe(true);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', cpfHash: null },
        data: { cpfHash: 'hash', cpfMasked: '***.982.247-**' },
      });
    });

    it('retorna false quando nenhuma linha foi atualizada (já tinha CPF)', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.setCpfIfEmpty('user-1', 'hash', '***.982.247-**'),
      ).resolves.toBe(false);
    });

    it('mapeia P2002 (unique) para ConflictException', async () => {
      prisma.user.updateMany.mockRejectedValue(knownError('P2002'));

      const promise = repository.setCpfIfEmpty(
        'user-1',
        'hash',
        '***.982.247-**',
      );
      await expect(promise).rejects.toBeInstanceOf(ConflictException);
      await expect(promise).rejects.toThrow(
        'Este CPF já está vinculado a outra conta',
      );
    });

    it('repassa outros erros conhecidos do Prisma', async () => {
      const error = knownError('P2025');
      prisma.user.updateMany.mockRejectedValue(error);
      await expect(
        repository.setCpfIfEmpty('user-1', 'hash', '***.982.247-**'),
      ).rejects.toBe(error);
    });

    it('repassa erros genéricos', async () => {
      const error = new Error('conexão perdida');
      prisma.user.updateMany.mockRejectedValue(error);
      await expect(
        repository.setCpfIfEmpty('user-1', 'hash', '***.982.247-**'),
      ).rejects.toBe(error);
    });

    it('não confunde um objeto com code P2002 que não é PrismaClientKnownRequestError', async () => {
      const error = Object.assign(new Error('fake'), { code: 'P2002' });
      prisma.user.updateMany.mockRejectedValue(error);
      await expect(
        repository.setCpfIfEmpty('user-1', 'hash', '***.982.247-**'),
      ).rejects.toBe(error);
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

  describe('replaceAvatarKey', () => {
    it('trava a linha, troca a chave e devolve a anterior e a foto do provedor', async () => {
      tx.$queryRaw.mockResolvedValue([
        { avatar_key: 'old', image: 'https://google/foto.jpg' },
      ]);

      await expect(
        repository.replaceAvatarKey('user-1', 'new'),
      ).resolves.toEqual({
        previousKey: 'old',
        image: 'https://google/foto.jpg',
      });
      const [sql] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray];
      expect(sql.join('?').replace(/\s+/g, ' ').trim()).toBe(
        'SELECT avatar_key, image FROM users WHERE id = ? FOR UPDATE',
      );
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { avatarKey: 'new' },
      });
    });

    it('usuário inexistente: NotFound', async () => {
      tx.$queryRaw.mockResolvedValue([]);
      await expect(
        repository.replaceAvatarKey('x', null),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });
});
