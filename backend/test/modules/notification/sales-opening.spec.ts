import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Mock } from 'vitest';
import type { MockPort } from '../../utils/mocks.js';
import type { PrismaService } from '../../../src/modules/prisma/prisma.service.js';
import { SALES_OPENING_NOTICE_MS } from '../../../src/modules/notification/core/entities/sales-opening.js';
import { SalesOpeningRepository } from '../../../src/modules/notification/adapters/outbound/repositories/sales-opening.repository.js';
import { SalesOpeningService } from '../../../src/modules/notification/application/services/sales-opening.service.js';
import type { SalesOpeningRepositoryPort } from '../../../src/modules/notification/application/ports/outbound/repositories/sales-opening.repository.port.js';
import type { SalesOpeningServicePort } from '../../../src/modules/notification/application/ports/inbound/services/sales-opening.service.port.js';
import {
  DEFAULT_SALES_OPENING_INTERVAL_MS,
  SALES_OPENING_JOB,
  SalesOpeningScheduler,
} from '../../../src/modules/notification/adapters/inbound/schedulers/sales-opening.scheduler.js';
import { ReactEmailRenderer } from '../../../src/modules/notification/adapters/outbound/renderers/react-email-renderer.js';

type RawCall = [TemplateStringsArray, ...unknown[]];
const sqlOf = (call: RawCall) => call[0].join('?').replace(/\s+/g, ' ').trim();

describe('aviso de abertura das vendas', () => {
  it('avisa 1 hora antes', () => {
    expect(SALES_OPENING_NOTICE_MS).toBe(60 * 60_000);
  });

  describe('SalesOpeningRepository.enqueueDue', () => {
    let prisma: { $executeRaw: Mock };
    let repository: SalesOpeningRepository;

    beforeEach(() => {
      prisma = { $executeRaw: vi.fn().mockResolvedValue(3) };
      repository = new SalesOpeningRepository(
        prisma as unknown as PrismaService,
      );
    });

    it('enfileira num INSERT só, um por favorito, sem duplicar', async () => {
      await expect(
        repository.enqueueDue(SALES_OPENING_NOTICE_MS),
      ).resolves.toBe(3);
      const [call] = prisma.$executeRaw.mock.calls as RawCall[];
      const sql = sqlOf(call);
      expect(sql).toMatch(/^INSERT INTO email_outbox/);
      expect(sql).toMatch(/FROM event_favorite AS f JOIN event AS e/);
      expect(sql).toMatch(/ON CONFLICT \(dedupe_key\) DO NOTHING/);
      expect(call.slice(1)).toContain(3600);
    });

    it('só eventos não cancelados, entre agora e a abertura (nada depois de abrir)', async () => {
      await repository.enqueueDue(SALES_OPENING_NOTICE_MS);
      const sql = sqlOf(prisma.$executeRaw.mock.calls[0] as RawCall);
      expect(sql).toContain('e.deleted_at IS NULL');
      expect(sql).toContain('e.sales_starts_at > NOW()');
      expect(sql).toContain(
        'e.sales_starts_at <= NOW() + make_interval(secs => ?)',
      );
    });

    it('a chave leva evento, data de abertura e usuário (adiar gera aviso novo)', async () => {
      await repository.enqueueDue(SALES_OPENING_NOTICE_MS);
      const sql = sqlOf(prisma.$executeRaw.mock.calls[0] as RawCall);
      expect(sql).toContain(
        `'sales-opening:' || e.id || ':' || ${'to_char(e.sales_starts_at, \'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\')'} || ':' || u.id`,
      );
    });
  });

  it('SalesOpeningService usa a antecedência de 1 hora', async () => {
    const repository: MockPort<SalesOpeningRepositoryPort> = {
      enqueueDue: vi.fn().mockResolvedValue(2),
    };
    await expect(
      new SalesOpeningService(repository).enqueueDue(),
    ).resolves.toBe(2);
    expect(repository.enqueueDue).toHaveBeenCalledWith(SALES_OPENING_NOTICE_MS);
  });

  describe('SalesOpeningScheduler', () => {
    let service: MockPort<SalesOpeningServicePort>;
    let registry: SchedulerRegistry;
    const build = (interval?: string) =>
      new SalesOpeningScheduler(service, registry, {
        get: vi.fn().mockReturnValue(interval),
      } as unknown as ConfigService);

    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      service = { enqueueDue: vi.fn().mockResolvedValue(0) };
      registry = new SchedulerRegistry();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('roda a cada minuto por padrão e para no shutdown', async () => {
      const scheduler = build();
      scheduler.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(DEFAULT_SALES_OPENING_INTERVAL_MS);
      expect(DEFAULT_SALES_OPENING_INTERVAL_MS).toBe(60_000);
      expect(service.enqueueDue).toHaveBeenCalledTimes(1);
      scheduler.onApplicationShutdown();
      expect(registry.doesExist('interval', SALES_OPENING_JOB)).toBe(false);
    });

    it('0 desliga; valor inválido impede a subida', () => {
      build('0').onApplicationBootstrap();
      expect(registry.doesExist('interval', SALES_OPENING_JOB)).toBe(false);
      expect(() => build('x').onApplicationBootstrap()).toThrow(
        /SALES_OPENING_INTERVAL_MS inválido/,
      );
    });

    it('erro no banco não derruba o agendador', async () => {
      service.enqueueDue.mockRejectedValue(new Error('banco fora'));
      await expect(build().tick()).resolves.toBeUndefined();
    });
  });

  it('template: assunto com a hora, data completa e link para o evento', async () => {
    const renderer = new ReactEmailRenderer({
      getOrThrow: () => 'http://localhost:3001/',
    } as unknown as ConfigService);

    const email = await renderer.render({
      kind: 'sales_opening',
      to: 'm@example.com',
      dedupeKey: 'sales-opening:3:2099-06-10T13:00:00.000Z:user-1',
      data: {
        userName: 'Maria Souza',
        eventId: 3,
        eventName: 'Show de Rock',
        eventLocation: 'Arena Central',
        eventStartsAt: '2099-06-20T23:00:00.000Z',
        // 13:00 UTC = 10:00 em Brasília
        salesStartsAt: '2099-06-10T13:00:00.000Z',
      },
    });

    expect(email.subject).toBe('As vendas de Show de Rock abrem às 10:00');
    expect(email.html).toContain('Maria');
    expect(email.html).toContain('href="http://localhost:3001/events/3"');
    expect(email.text).toContain('10 de junho de 2099');
    expect(email.text).toContain('Arena Central');
    expect(email.text).not.toContain('<');
  });
});
