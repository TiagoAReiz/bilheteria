import {ConflictException, Injectable, NotFoundException} from "@nestjs/common";
import {Prisma} from "../../../../../generated/prisma/client.js";
import {PrismaService} from "../../../../prisma/prisma.service.js";
import {UserRepositoryPort} from "../../../application/ports/outbound/repositories/user.repository.port.js";
import {Role} from "../../../core/entities/role.js";

@Injectable()
export class UserRepository implements UserRepositoryPort {
    constructor(private readonly prisma: PrismaService) {
    }

    async getCpfHashById(id: string): Promise<string | null> {
        const user = await this.prisma.user.findUnique({where: {id}, select: {cpfHash: true}});
        if (user) {
            return user.cpfHash;
        }
        throw new NotFoundException(`O usuário ${id} não foi encontrado`);
    }

    async setCpfHashIfEmpty(id: string, cpfHash: string): Promise<boolean> {
        try {
            const {count} = await this.prisma.user.updateMany({where: {id, cpfHash: null}, data: {cpfHash}});
            return count > 0;
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new ConflictException('Este CPF já está vinculado a outra conta');
            }
            throw e;
        }
    }

    async promoteToOrganizer(id: string): Promise<void> {
        // so promove USER: ADMIN nunca e rebaixado e ORGANIZER ja esta no lugar
        await this.prisma.user.updateMany({where: {id, role: Role.USER}, data: {role: Role.ORGANIZER}});
    }
}
