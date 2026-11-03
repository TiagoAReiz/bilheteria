import type { Mock } from 'vitest';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { MockPort } from '../../../../../utils/mocks.js';
import {
  AVAILABLE_TICKETS_JOB,
  AvailableTicketsScheduler,
  DEFAULT_AVAILABILITY_REFRESH_INTERVAL_MS,
} from '../../../../../../src/modules/event/adapters/inbound/schedulers/available-tickets.scheduler.js';
import type { EventAvailabilityServicePort } from '../../../../../../src/modules/event/application/ports/inbound/services/event-availability.service.port.js';

const configWith = (value: string | undefined) =>
  ({ get: vi.fn().mockReturnValue(value) }) as unknown as ConfigService;

describe('AvailableTicketsScheduler', () => {
  let availability: MockPort<EventAvailabilityServicePort>;
  let registry: SchedulerRegistry;
  let logError: Mock;

  const build = (interval?: string) =>
    new AvailableTicketsScheduler(
      availability as EventAvailabilityServicePort,
      registry,
      configWith(interval),
    );

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined) as unknown as Mock;
    availability = { refreshAvailableTickets: vi.fn().mockResolvedValue(0) };
    registry = new SchedulerRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('agendamento', () => {
    it('roda a cada 10s por padrão', async () => {
      const scheduler = build();
      scheduler.onApplicationBootstrap();

      expect(registry.doesExist('interval', AVAILABLE_TICKETS_JOB)).toBe(true);
      await vi.advanceTimersByTimeAsync(
        DEFAULT_AVAILABILITY_REFRESH_INTERVAL_MS - 1,
      );
      expect(availability.refreshAvailableTickets).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(availability.refreshAvailableTickets).toHaveBeenCalledTimes(1);

      scheduler.onApplicationShutdown();
    });

    it('respeita AVAILABILITY_REFRESH_INTERVAL_MS', async () => {
      const scheduler = build('2500');
      scheduler.onApplicationBootstrap();

      await vi.advanceTimersByTimeAsync(5000);
      expect(availability.refreshAvailableTickets).toHaveBeenCalledTimes(2);

      scheduler.onApplicationShutdown();
    });

    it('0 desliga o job', async () => {
      build('0').onApplicationBootstrap();

      expect(registry.doesExist('interval', AVAILABLE_TICKETS_JOB)).toBe(false);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(availability.refreshAvailableTickets).not.toHaveBeenCalled();
    });

    it.each(['abc', '-1'])('valor inválido (%s) falha na subida', (value) => {
      expect(() => build(value).onApplicationBootstrap()).toThrow(
        'AVAILABILITY_REFRESH_INTERVAL_MS inválido',
      );
    });

    it('para o intervalo no shutdown', async () => {
      const scheduler = build('1000');
      scheduler.onApplicationBootstrap();
      scheduler.onApplicationShutdown();

      expect(registry.doesExist('interval', AVAILABLE_TICKETS_JOB)).toBe(false);
      await vi.advanceTimersByTimeAsync(5000);
      expect(availability.refreshAvailableTickets).not.toHaveBeenCalled();
    });

    it('shutdown sem job registrado não falha', () => {
      expect(() => build('0').onApplicationShutdown()).not.toThrow();
    });
  });

  describe('refresh', () => {
    it('chama o caso de uso', async () => {
      availability.refreshAvailableTickets.mockResolvedValue(4);
      await build().refresh();
      expect(availability.refreshAvailableTickets).toHaveBeenCalledTimes(1);
    });

    it('falha do banco só gera log; a próxima rodada tenta de novo', async () => {
      availability.refreshAvailableTickets
        .mockRejectedValueOnce(new Error('connection refused'))
        .mockResolvedValueOnce(1);
      const scheduler = build();

      await expect(scheduler.refresh()).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('connection refused'),
      );
      await scheduler.refresh();
      expect(availability.refreshAvailableTickets).toHaveBeenCalledTimes(2);
    });

    it('não sobrepõe rodadas: se a anterior não terminou, pula', async () => {
      let finish!: (value: number) => void;
      availability.refreshAvailableTickets.mockReturnValueOnce(
        new Promise<number>((resolve) => (finish = resolve)),
      );
      const scheduler = build();

      const first = scheduler.refresh();
      await scheduler.refresh();
      expect(availability.refreshAvailableTickets).toHaveBeenCalledTimes(1);

      finish(0);
      await first;
      await scheduler.refresh();
      expect(availability.refreshAvailableTickets).toHaveBeenCalledTimes(2);
    });
  });
});
