import type { ConfigService } from '@nestjs/config';
import { ReactEmailRenderer } from '../../../../../../src/modules/notification/adapters/outbound/renderers/react-email-renderer.js';
import {
  formatEventDate,
  formatMoney,
} from '../../../../../../src/modules/notification/adapters/outbound/renderers/templates/format.js';
import { ticketConfirmedEmail } from '../../../../../../src/modules/notification/core/entities/email.js';

const config = {
  getOrThrow: () => 'http://localhost:3001/',
} as unknown as ConfigService;

const request = ticketConfirmedEmail('pay-1', 'm@example.com', {
  userName: 'Maria Souza',
  eventId: 3,
  eventName: 'Show de Rock',
  // 23:00 UTC = 20:00 em Brasília
  eventStartsAt: '2099-06-20T23:00:00.000Z',
  eventLocation: 'Arena Central',
  ticketId: 42,
  amountCents: 8990,
  currency: 'BRL',
});

describe('ReactEmailRenderer', () => {
  it('ingresso confirmado: assunto, HTML e texto com os dados do evento', async () => {
    const email = await new ReactEmailRenderer(config).render(request);

    expect(email.subject).toBe(
      'Seu ingresso para Show de Rock está confirmado',
    );
    expect(email.html).toContain('<html');
    expect(email.html).toContain('Pagamento aprovado, Maria!');
    expect(email.html).toContain('Arena Central');
    // link sem barra dupla, mesmo com FRONTEND_URL terminando em /
    expect(email.html).toContain('href="http://localhost:3001/my-tickets"');
    expect(email.text).toContain('Show de Rock');
    expect(email.text).toContain('20:00');
    expect(email.text).toContain('#42');
    expect(email.text).not.toContain('<');
  });

  it('escapa HTML vindo do nome do evento', async () => {
    const email = await new ReactEmailRenderer(config).render({
      ...request,
      data: { ...request.data, eventName: '<script>alert(1)</script>' },
    });
    expect(email.html).not.toContain('<script>');
  });
});

describe('formatação', () => {
  it('data no horário de Brasília', () => {
    expect(formatEventDate('2099-06-20T23:00:00.000Z')).toBe(
      'sábado, 20 de junho de 2099 às 20:00',
    );
  });

  it('valor em reais', () => {
    expect(formatMoney(8990, 'BRL')).toBe('R$ 89,90');
  });
});
