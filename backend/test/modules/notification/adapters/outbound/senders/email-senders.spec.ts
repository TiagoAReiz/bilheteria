import type { ConfigService } from '@nestjs/config';
import { ResendEmailSender } from '../../../../../../src/modules/notification/adapters/outbound/senders/resend-email-sender.js';
import { SmtpEmailSender } from '../../../../../../src/modules/notification/adapters/outbound/senders/smtp-email-sender.js';
import {
  DEFAULT_EMAIL_FROM,
  createEmailSender,
} from '../../../../../../src/modules/notification/adapters/outbound/senders/email-sender.factory.js';
import { EmailSendError } from '../../../../../../src/modules/notification/application/ports/outbound/senders/email-sender.port.js';

const EMAIL = {
  to: 'm@example.com',
  subject: 'Assunto',
  html: '<p>oi</p>',
  text: 'oi',
  idempotencyKey: 'ticket-confirmed:pay-1',
};

const configOf = (values: Record<string, string>) =>
  ({
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (!(key in values)) throw new Error(`faltando ${key}`);
      return values[key];
    },
  }) as unknown as ConfigService;

describe('ResendEmailSender', () => {
  const clientWith = (send: ReturnType<typeof vi.fn>) =>
    ({ emails: { send } }) as unknown as ConstructorParameters<
      typeof ResendEmailSender
    >[0];

  it('envia com remetente, html, texto e idempotency key', async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ data: { id: 'res-1' }, error: null });
    const sender = new ResendEmailSender(
      clientWith(send),
      'Bilheteria <a@b.com>',
    );

    await expect(sender.send(EMAIL)).resolves.toEqual({
      providerMessageId: 'res-1',
    });
    expect(send).toHaveBeenCalledWith(
      {
        from: 'Bilheteria <a@b.com>',
        to: 'm@example.com',
        subject: 'Assunto',
        html: '<p>oi</p>',
        text: 'oi',
      },
      { idempotencyKey: 'ticket-confirmed:pay-1' },
    );
  });

  it.each([
    ['invalid_from_address', 422, true],
    ['validation_error', 403, true],
    ['rate_limit_exceeded', 429, false],
    ['daily_quota_exceeded', 429, false],
    ['internal_server_error', 500, false],
  ])('erro %s (%i) → permanente=%s', async (name, statusCode, permanent) => {
    const send = vi.fn().mockResolvedValue({
      data: null,
      error: { name, statusCode, message: 'recusado' },
    });
    const error = await new ResendEmailSender(clientWith(send), 'x')
      .send(EMAIL)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as EmailSendError).permanent).toBe(permanent);
  });

  it('erro de rede é temporário', async () => {
    const send = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const error = await new ResendEmailSender(clientWith(send), 'x')
      .send(EMAIL)
      .catch((e: unknown) => e);
    expect((error as EmailSendError).permanent).toBe(false);
  });
});

describe('SmtpEmailSender', () => {
  it('envia pelo transporte com o id da mensagem de volta', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: '<id@local>' });
    const sender = new SmtpEmailSender({ sendMail }, 'Bilheteria <a@b.com>');

    await expect(sender.send(EMAIL)).resolves.toEqual({
      providerMessageId: '<id@local>',
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Bilheteria <a@b.com>',
        to: 'm@example.com',
        text: 'oi',
      }),
    );
  });

  it.each([
    [550, true],
    [421, false],
    [undefined, false],
  ])('resposta SMTP %s → permanente=%s', async (responseCode, permanent) => {
    const sendMail = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('recusado'), { responseCode }),
      );
    const error = await new SmtpEmailSender({ sendMail }, 'x')
      .send(EMAIL)
      .catch((e: unknown) => e);
    expect((error as EmailSendError).permanent).toBe(permanent);
  });
});

describe('createEmailSender', () => {
  it('padrão é SMTP (Mailpit) com o remetente de teste do Resend', () => {
    const sender = createEmailSender(configOf({}));
    expect(sender).toBeInstanceOf(SmtpEmailSender);
    expect(DEFAULT_EMAIL_FROM).toBe('Bilheteria <onboarding@resend.dev>');
  });

  it('EMAIL_DRIVER=resend usa o Resend', () => {
    expect(
      createEmailSender(
        configOf({ EMAIL_DRIVER: 'resend', RESEND_API_KEY: 're_teste' }),
      ),
    ).toBeInstanceOf(ResendEmailSender);
  });

  it('Resend sem RESEND_API_KEY não sobe', () => {
    expect(() =>
      createEmailSender(configOf({ EMAIL_DRIVER: 'resend' })),
    ).toThrow(/RESEND_API_KEY/);
  });

  it('driver desconhecido não sobe', () => {
    expect(() =>
      createEmailSender(configOf({ EMAIL_DRIVER: 'sendgrid' })),
    ).toThrow(/EMAIL_DRIVER inválido/);
  });
});
