import {BadRequestException, ConflictException, Inject, Injectable} from '@nestjs/common';
import {Cpf} from "../../core/entities/cpf.js";
import {UserServicePort} from "../ports/inbound/services/user.service.port.js";
import {USER_REPOSITORY, type UserRepositoryPort} from "../ports/outbound/repositories/user.repository.port.js";
import {CPF_HASHER, type CpfHasherPort} from "../ports/outbound/crypto/cpf-hasher.port.js";

@Injectable()
export class UserService implements UserServicePort {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort, @Inject(CPF_HASHER) private readonly cpfHasher: CpfHasherPort) {}

  async registerCpf(userId: string, rawCpf: string): Promise<void> {
    const cpf = Cpf.create(rawCpf);
    if (!cpf) {
      throw new BadRequestException('CPF inválido');
    }
    if (!(await this.userRepository.setCpfHashIfEmpty(userId, this.cpfHasher.hash(cpf)))) {
      throw new ConflictException('O CPF deste usuário já foi cadastrado e não pode ser alterado');
    }
  }

  async becomeOrganizer(userId: string): Promise<void> {
    await this.userRepository.promoteToOrganizer(userId);
  }

  async hasCpf(userId: string): Promise<boolean> {
    return (await this.userRepository.getCpfHashById(userId)) !== null;
  }
}
