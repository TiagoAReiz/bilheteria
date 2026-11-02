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
}
