import {Injectable, NotFoundException} from "@nestjs/common";
import {PrismaService} from "../../../../prisma/prisma.service.js";
import {Event} from "../../../core/entities/event.entity.js";
import {NewEvent} from "../../../core/entities/new-event.entity.js";
import {EventRepositoryPort} from "../../../application/ports/outbound/repositories/event.repository.port.js";

@Injectable()
export class EventRepository implements EventRepositoryPort {
    constructor(private readonly prisma: PrismaService) {
    }

    // evento e ingressos na mesma transacao: nunca existe evento sem os seus ingressos
    async createWithTickets(event: NewEvent): Promise<Event> {
        return await this.prisma.event.create({
            data: {
                name: event.name,
                description: event.description,
                location: event.location,
                starts_at: event.starts_at,
                capacity: event.capacity,
                price_cents: event.price_cents,
                // todos os ingressos nascem livres; daqui em diante quem mantem e o job de disponibilidade
                available_tickets: event.capacity,
                organizer_id: event.organizer_id,
                tickets: {
                    createMany: {data: Array.from({length: event.capacity}, () => ({is_paid: false}))},
                },
            },
        });
    }

    async getUpcomingEvents(): Promise<Event[]> {
        return await this.prisma.event.findMany({
            where: {deleted_at: null, starts_at: {gt: new Date()}},
            orderBy: {starts_at: 'asc'},
        });
    }

    async getEventById(id: number): Promise<Event> {
        const event = await this.prisma.event.findFirst({where: {id, deleted_at: null}});
        if (event) {
            return event;
        }
        throw new NotFoundException(`O evento ${id} não foi encontrado`);
    }

    // inclui eventos excluidos: a posse dos ingressos continua sendo do organizador
    async getEventIdsByOrganizer(organizerId: string): Promise<number[]> {
        const events = await this.prisma.event.findMany({
            where: {organizer_id: organizerId},
            select: {id: true},
            orderBy: {id: 'asc'},
        });
        return events.map((event) => event.id);
    }

    // um unico UPDATE em lote: conta os disponiveis com o mesmo criterio da reserva e do /status/:id
    // e so grava onde o numero mudou, para nao gerar escrita (nem mensagem de CDC) a toa.
    // Eventos passados ou excluidos ficam de fora: nao aparecem na busca.
    async refreshAvailableTickets(reservationTtlMinutes: number): Promise<number> {
        return await this.prisma.$executeRaw`
            UPDATE event AS e
            SET available_tickets = c.available
            FROM (
                SELECT ev.id,
                       COUNT(t.id) FILTER (
                           WHERE t.is_paid = false
                             AND (t.reserved_at IS NULL OR t.reserved_at < NOW() - make_interval(mins => ${reservationTtlMinutes}))
                       )::int AS available
                FROM event AS ev
                LEFT JOIN ticket AS t ON t.event_id = ev.id
                WHERE ev.deleted_at IS NULL AND ev.starts_at > NOW()
                GROUP BY ev.id
            ) AS c
            WHERE e.id = c.id AND e.available_tickets <> c.available`;
    }
}
