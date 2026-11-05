import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Cpf } from '../../core/entities/cpf.js';
import { resolveAvatarUrl } from '../../core/entities/avatar.js';
import { UserServicePort } from '../ports/inbound/services/user.service.port.js';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../ports/outbound/repositories/user.repository.port.js';
import {
  CPF_HASHER,
  type CpfHasherPort,
} from '../ports/outbound/crypto/cpf-hasher.port.js';
import {
  IMAGE_STORAGE_SERVICE,
  type ImageStorageServicePort,
} from '../../../storage/application/ports/inbound/services/image-storage.service.port.js';
import {
  PresignedUpload,
  imagePrefixes,
} from '../../../storage/core/entities/image.js';

@Injectable()
export class UserService implements UserServicePort {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
    @Inject(CPF_HASHER) private readonly cpfHasher: CpfHasherPort,
    @Inject(IMAGE_STORAGE_SERVICE)
    private readonly images: ImageStorageServicePort,
  ) {}

  async registerCpf(userId: string, rawCpf: string): Promise<void> {
    const cpf = Cpf.create(rawCpf);
    if (!cpf) {
      throw new BadRequestException('CPF inválido');
    }
    if (
      !(await this.userRepository.setCpfIfEmpty(
        userId,
        this.cpfHasher.hash(cpf),
        cpf.masked,
      ))
    ) {
      throw new ConflictException(
        'O CPF deste usuário já foi cadastrado e não pode ser alterado',
      );
    }
  }

  async becomeOrganizer(userId: string): Promise<void> {
    await this.userRepository.promoteToOrganizer(userId);
  }

  async createAvatarUpload(
    userId: string,
    contentType: string,
  ): Promise<PresignedUpload> {
    return this.images.createUpload(
      'user_avatar',
      imagePrefixes.userAvatar(userId),
      contentType,
    );
  }

  async confirmAvatar(
    userId: string,
    key: string,
  ): Promise<{ avatar_url: string }> {
    // o prefixo tem o id da sessão: ninguém confirma como avatar um objeto de outra pessoa
    await this.images.confirmUpload(
      'user_avatar',
      imagePrefixes.userAvatar(userId),
      key,
    );
    const { previousKey } = await this.userRepository.replaceAvatarKey(
      userId,
      key,
    );
    if (previousKey !== key) {
      await this.images.deleteQuietly('user_avatar', previousKey);
    }
    return { avatar_url: this.images.publicUrl(key) };
  }

  async removeAvatar(userId: string): Promise<{ avatar_url: string | null }> {
    const { previousKey, image } = await this.userRepository.replaceAvatarKey(
      userId,
      null,
    );
    await this.images.deleteQuietly('user_avatar', previousKey);
    return {
      avatar_url: resolveAvatarUrl({ avatarKey: null, image }, (key) =>
        this.images.publicUrl(key),
      ),
    };
  }

  async hasCpf(userId: string): Promise<boolean> {
    return (await this.getCpfStatus(userId)).hasCpf;
  }

  async getCpfStatus(
    userId: string,
  ): Promise<{ hasCpf: boolean; cpfMasked: string | null }> {
    const { cpfHash, cpfMasked } = await this.userRepository.getCpfById(userId);
    return {
      hasCpf: cpfHash !== null,
      cpfMasked: cpfHash !== null ? cpfMasked : null,
    };
  }
}
