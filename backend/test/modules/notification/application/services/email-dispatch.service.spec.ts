import { Logger } from '@nestjs/common';
import type { MockPort } from '../../../../utils/mocks.js';
import { EmailDispatchService } from '../../../../../src/modules/notification/application/services/email-dispatch.service.js';
import type { EmailOutboxRepositoryPort } from '../../../../../src/modules/notification/application/ports/outbound/repositories/email-outbox.repository.port.js';
import type { EmailRendererPort } from '../../../../../src/modules/notification/application/ports/outbound/renderers/email-renderer.port.js';
import {
  EmailSendError,
  type EmailSenderPort,
} from '../../../../../src/modules/notification/application/ports/outbound/senders/email-sender.port.js';
import type { EmailMetricsPort } from '../../../../../src/modules/notification/application/ports/outbound/metrics/email-metrics.port.js';
import type { OutboxEmail } from '../../../../../src/modules/notification/core/entities/email.js';
import { MAX_EMAIL_ATTEMPTS } from '../../../../../src/modules/notification/core/entities/email-retry.js';

const outboxEmail = (
  overrides: Partial<Omit<OutboxEmail, 'kind' | 'data'>> = {},
): OutboxEmail => ({
  id: 'mail-1',
  attempts: 1,
  kind: 'ticket_confirmed',
  to: 'm@example.com',
  dedupeKey: 'ticket-confirmed:pay-1',
  data: {
    userName: 'Maria',
    eventId: 1,
    eventName: 'Show',
    eventStartsAt: '2026-06-20T23:00:00.000Z',
    eventLocation: 'Arena',
    ticketId: 7,
    amountCents: 5000,
    currency: 'BRL',
  },
  ...overrides,
});

const RENDERED = { subject: 'Assunto', html: '<p>oi</p>', text: 'oi' };

describe('EmailDispatchService', () => {
  let outbox: MockPort<EmailOutboxRepositoryPort>;
  let renderer: MockPort<EmailRendererPort>;
  let sender: MockPort<EmailSenderPort>;
  let metrics: MockPort<EmailMetricsPort>;
  let service: EmailDispatchService;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    outbox = {
      claimDue: vi.fn().mockResolvedValue([outboxEmail()]),
      markSent: vi.fn().mockResolvedValue(undefined),
      scheduleRetry: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    renderer = { render: vi.fn().mockResolvedValue(RENDERED) };
    sender = {
      provider: 'teste',
      send: vi.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
    };
    metrics = { emailProcessed: vi.fn() };
    service = new EmailDispatchService(outbox, renderer, sender, metrics);
  });

  afterEach(() => vi.restoreAllMocks());

  it('renderiza, envia com a dedupe key como idempotency key e marca enviado', async () => {
    await expect(service.dispatchDue()).resolves.toEqual({
      sent: 1,
      retried: 0,
      failed: 0,
    });

    expect(outbox.claimDue).toHaveBeenCalledWith(20, 5 * 60_000);
    expect(sender.send).toHaveBeenCalledWith({
      ...RENDERED,
      to: 'm@example.com',
      idempotencyKey: 'ticket-confirmed:pay-1',
    });
    expect(outbox.markSent).toHaveBeenCalledWith('mail-1', 'msg-1');
    expect(metrics.emailProcessed).toHaveBeenCalledWith(
      'ticket_confirmed',
      'sent',
    );
  });

  it('nada vencido: não envia nada', async () => {
    outbox.claimDue.mockResolvedValue([]);
    await expect(service.dispatchDue()).resolves.toEqual({
      sent: 0,
      retried: 0,
      failed: 0,
    });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('falha temporária agenda nova tentativa e guarda o erro', async () => {
    sender.send.mockRejectedValue(new EmailSendError('rate limit', false));

    await expect(service.dispatchDue()).resolves.toEqual({
      sent: 0,
      retried: 1,
      failed: 0,
    });

    expect(outbox.scheduleRetry).toHaveBeenCalledWith(
      'mail-1',
      expect.any(Date),
      'rate limit',
    );
    expect(outbox.markSent).not.toHaveBeenCalled();
    expect(metrics.emailProcessed).toHaveBeenCalledWith(
      'ticket_confirmed',
      'retry',
    );
  });

  it('falha permanente desiste sem nova tentativa', async () => {
    sender.send.mockRejectedValue(
      new EmailSendError('remetente inválido', true),
    );

    await expect(service.dispatchDue()).resolves.toEqual({
      sent: 0,
      retried: 0,
      failed: 1,
    });
    expect(outbox.markFailed).toHaveBeenCalledWith(
      'mail-1',
      'remetente inválido',
    );
    expect(outbox.scheduleRetry).not.toHaveBeenCalled();
  });

  it('última tentativa temporária também desiste', async () => {
    outbox.claimDue.mockResolvedValue([
      outboxEmail({ attempts: MAX_EMAIL_ATTEMPTS }),
    ]);
    sender.send.mockRejectedValue(new EmailSendError('fora do ar', false));

    await expect(service.dispatchDue()).resolves.toEqual({
      sent: 0,
      retried: 0,
      failed: 1,
    });
  });

  it('erro de template (não é EmailSendError) é permanente e nem chega ao provedor', async () => {
    renderer.render.mockRejectedValue(new TypeError('campo faltando'));

    await expect(service.dispatchDue()).resolves.toEqual({
      sent: 0,
      retried: 0,
      failed: 1,
    });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('um email com problema não impede os outros do lote', async () => {
    outbox.claimDue.mockResolvedValue([
      outboxEmail({ id: 'a' }),
      outboxEmail({ id: 'b', dedupeKey: 'ticket-confirmed:pay-2' }),
    ]);
    sender.send
      .mockRejectedValueOnce(new EmailSendError('fora do ar', false))
      .mockResolvedValueOnce({ providerMessageId: 'msg-b' });

    await expect(service.dispatchDue()).resolves.toEqual({
      sent: 1,
      retried: 1,
      failed: 0,
    });
    expect(outbox.markSent).toHaveBeenCalledWith('b', 'msg-b');
  });
});
