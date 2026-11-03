import {ConflictException, Injectable, NotFoundException} from "@nestjs/common";
import {Prisma} from "../../../../../generated/prisma/client.js";
import {PrismaService} from "../../../../prisma/prisma.service.js";
import {StoredCpf, UserRepositoryPort} from "../../../application/ports/outbound/repositories/user.repository.port.js";
import {Role} from "../../../core/entities/role.js";

@Injectable()
export class UserRepository implements UserRepositoryPort {
    constructor(private readonly prisma: PrismaService) {
    }

    async getCpfById(id: string): Promise<StoredCpf> {
        const user = await this.prisma.user.findUnique({where: {id}, select: {cpfHash: true, cpfMasked: true}});
        if (user) {
            return user;
        }
        throw new NotFoundException(`O usuário ${id} não foi encontrado`);
    }

    async setCpfIfEmpty(id: string, cpfHash: string, cpfMasked: string): Promise<boolean> {
        try {
            const {count} = await this.prisma.user.updateMany({where: {id, cpfHash: null}, data: {cpfHash, cpfMasked}});
            return count > 0;
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new ConflictException('Este CPF já está vinculado a outra conta');
            }
            throw e;
        }
    }

    async replaceAvatarKey(id: string, key: string | null): Promise<{previousKey: string | null; image: string | null}> {
        // linha travada: duas trocas simultâneas não "perdem" a chave anterior (que ficaria órfã no bucket)
        return await this.prisma.$transaction(async (tx) => {
            const [user] = await tx.$queryRaw<{avatar_key: string | null; image: string | null}[]>`
                SELECT avatar_key, image FROM users WHERE id = ${id} FOR UPDATE`;
            if (!user) {
                throw new NotFoundException(`O usuário ${id} não foi encontrado`);
            }
            await tx.user.update({where: {id}, data: {avatarKey: key}});
            return {previousKey: user.avatar_key, image: user.image};
        });
    }

    async promoteToOrganizer(id: string): Promise<void> {
        // so promove USER: ADMIN nunca e rebaixado e ORGANIZER ja esta no lugar
        await this.prisma.user.updateMany({where: {id, role: Role.USER}, data: {role: Role.ORGANIZER}});
    }
}
