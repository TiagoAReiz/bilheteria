import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { SalesOpeningRepositoryPort } from '../../../application/ports/outbound/repositories/sales-opening.repository.port.js';

@Injectable()
export class SalesOpeningRepository implements SalesOpeningRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  // Um INSERT ... SELECT só: o banco cruza favoritos x eventos na janela e a dedupe_key única
  // descarta quem já foi enfileirado. Os timestamps são guardados em UTC (TIMESTAMP(3) do Prisma);
  // o to_char gera o mesmo ISO do Date.toISOString(). Depois de abertas as vendas nada é enviado:
  // se o agendador ficou parado e perdeu a janela, o aviso não sai atrasado.
  async enqueueDue(noticeMs: number): Promise<number> {
    const noticeSecs = Math.round(noticeMs / 1000);
    return await this.prisma.$executeRaw`
            INSERT INTO email_outbox (id, kind, dedupe_key, to_email, payload, updated_at)
            SELECT gen_random_uuid()::text,
                   'sales_opening',
                   'sales-opening:' || e.id || ':' || to_char(e.sales_starts_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || ':' || u.id,
                   u.email,
                   jsonb_build_object(
                       'userName', u.name,
                       'eventId', e.id,
                       'eventName', e.name,
                       'eventLocation', e.location,
                       'eventStartsAt', to_char(e.starts_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                       'salesStartsAt', to_char(e.sales_starts_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                   ),
                   NOW()
            FROM event_favorite AS f
            JOIN event AS e ON e.id = f.event_id
            JOIN users AS u ON u.id = f.user_id
            WHERE e.deleted_at IS NULL
              AND e.sales_starts_at > NOW()
              AND e.sales_starts_at <= NOW() + make_interval(secs => ${noticeSecs})
            ON CONFLICT (dedupe_key) DO NOTHING`;
  }
}
