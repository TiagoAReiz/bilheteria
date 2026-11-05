import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { MockPort } from '../../../../../utils/mocks.js';
import {
  DEFAULT_EMAIL_DISPATCH_INTERVAL_MS,
  EMAIL_OUTBOX_JOB,
  EmailOutboxScheduler,
} from '../../../../../../src/modules/notification/adapters/inbound/schedulers/email-outbox.scheduler.js';
import type { EmailDispatchServicePort } from '../../../../../../src/modules/notification/application/ports/inbound/services/email-dispatch.service.port.js';

const configWith = (value: string | undefined) =>
  ({ get: vi.fn().mockReturnValue(value) }) as unknown as ConfigService;

describe('EmailOutboxScheduler', () => {
  let dispatch: MockPort<EmailDispatchServicePort>;
  let registry: SchedulerRegistry;

  const build = (interval?: string) =>
    new EmailOutboxScheduler(dispatch, registry, configWith(interval));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    dispatch = {
      dispatchDue: vi
        .fn()
        .mockResolvedValue({ sent: 0, retried: 0, failed: 0 }),
    };
    registry = new SchedulerRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('processa a outbox a cada 5s por padrão', async () => {
    const scheduler = build();
    scheduler.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(DEFAULT_EMAIL_DISPATCH_INTERVAL_MS);
    expect(dispatch.dispatchDue).toHaveBeenCalledTimes(1);
    scheduler.onApplicationShutdown();
    expect(registry.doesExist('interval', EMAIL_OUTBOX_JOB)).toBe(false);
  });

  it('EMAIL_DISPATCH_INTERVAL_MS=0 desliga o envio', () => {
    build('0').onApplicationBootstrap();
    expect(registry.doesExist('interval', EMAIL_OUTBOX_JOB)).toBe(false);
  });

  it('intervalo inválido impede a subida', () => {
    expect(() => build('abc').onApplicationBootstrap()).toThrow(
      /EMAIL_DISPATCH_INTERVAL_MS inválido/,
    );
  });

  it('erro no lote não derruba o worker', async () => {
    dispatch.dispatchDue.mockRejectedValue(new Error('banco fora'));
    await expect(build().tick()).resolves.toBeUndefined();
  });

  it('não empilha rodadas: um tick em andamento faz o próximo pular', async () => {
    let release!: () => void;
    dispatch.dispatchDue.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ sent: 0, retried: 0, failed: 0 });
      }),
    );
    const scheduler = build();
    const first = scheduler.tick();
    await scheduler.tick();
    release();
    await first;
    expect(dispatch.dispatchDue).toHaveBeenCalledTimes(1);
  });
});
