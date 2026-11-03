import {Injectable} from "@nestjs/common";
import {Ticket} from "../../../core/entities/ticket.entity.js";
import {ReservationResult, RESERVATION_TTL_MINUTES} from "../../../core/entities/reservation.entity.js";
import {PrismaService} from "../../../../prisma/prisma.service.js";
import {TicketRepositoryPort} from "../../../application/ports/outbound/repositories/ticket.repository.port.js";
import {UserTicketRow} from "../../../core/entities/my-ticket.entity.js";

@Injectable()
export class TicketRepository implements TicketRepositoryPort {
    constructor(private readonly prisma: PrismaService) {
    }

    async reserveTicketWithinLimit(user_id: string, event_id: number, limit: number): Promise<ReservationResult> {
        return await this.prisma.$transaction(async (tx) => {
            // trava a linha do usuario: reservas simultaneas do mesmo usuario contam e reservam uma de cada vez,
            // senao duas requisicoes leriam "1 ingresso" ao mesmo tempo e o usuario ficaria com 3
            await tx.$queryRaw`SELECT id FROM users WHERE id = ${user_id} FOR UPDATE`;

            // reserva expirada nao conta: o ingresso voltou a ficar disponivel
            const [{count}] = await tx.$queryRaw<{count: number}[]>`
                SELECT COUNT(*)::int AS count FROM ticket
                WHERE user_id = ${user_id}
                  AND event_id = ${event_id}
                  AND (is_paid = true OR reserved_at >= NOW() - make_interval(mins => ${RESERVATION_TTL_MINUTES}))`;
            if (count >= limit) {
                return {outcome: 'limit_reached'};
            }

            const [ticket] = await tx.$queryRaw<Ticket[]>`
                UPDATE ticket
                SET user_id = ${user_id}, reserved_at = NOW()
                WHERE id = (
                    SELECT id FROM ticket
                    WHERE event_id = ${event_id}
                      AND is_paid = false
                      AND (reserved_at IS NULL OR reserved_at < NOW() - make_interval(mins => ${RESERVATION_TTL_MINUTES}))
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING *`;
            return ticket ? {outcome: 'reserved', ticket} : {outcome: 'sold_out'};
        });
    }
    async getTicketsByUserAndEvent(user_id: string, event_id: number): Promise<Ticket[]> {
        return await this.prisma.ticket.findMany({where: {
                user_id,
                event_id,
            },})
    }

    async getCountAvailablesTicketsByEvent(id: number):Promise<number> {
        const expiredBefore = new Date(Date.now() - RESERVATION_TTL_MINUTES * 60 * 1000) ;

        // mesmo criterio da query de reserva: reserva expirada continua com user_id mas esta disponivel
        return await this.prisma.ticket.count({
            where: {
                event_id: id,
                is_paid: false,
                OR: [
                    { reserved_at: null },
                    { reserved_at: { lt: expiredBefore } },
                ],
            },
        });
    }
    async getCountAllTicketsByEvent(id: number):Promise<number> {
        return await this.prisma.ticket.count({where: {event_id: id}})
    }

    async getActiveTicketsByUser(user_id: string, reservedSince: Date): Promise<UserTicketRow[]> {
        return await this.prisma.ticket.findMany({
            where: {
                user_id,
                deleted_at: null,
                event: {deleted_at: null},
                OR: [{is_paid: true}, {reserved_at: {gte: reservedSince}}],
            },
            select: {
                id: true,
                is_paid: true,
                reserved_at: true,
                event: {select: {id: true, name: true, location: true, starts_at: true}},
            },
            orderBy: [{event: {starts_at: 'asc'}}, {id: 'asc'}],
        });
    }
}
