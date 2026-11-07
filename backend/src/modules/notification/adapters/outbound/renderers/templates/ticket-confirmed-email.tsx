import { Button, Heading, Section, Text } from '@react-email/components';
import type { TicketConfirmedData } from '../../../../core/entities/email.js';
import { EmailLayout, colors } from './email-layout.js';
import { formatEventDate, formatMoney } from './format.js';

export interface TicketConfirmedEmailProps extends TicketConfirmedData {
  myTicketsUrl: string;
}

export function ticketConfirmedSubject(data: TicketConfirmedData): string {
  return `Seu ingresso para ${data.eventName} está confirmado`;
}

const label = {
  color: colors.muted,
  fontSize: 12,
  letterSpacing: 1,
  margin: '0 0 2px',
  textTransform: 'uppercase' as const,
};
const value = { color: colors.ink, fontSize: 16, margin: '0 0 16px' };

export function TicketConfirmedEmail(props: TicketConfirmedEmailProps) {
  const firstName = props.userName.trim().split(/\s+/)[0];
  return (
    <EmailLayout
      preview={`Pagamento aprovado: ingresso #${props.ticketId} para ${props.eventName}`}
    >
      <Heading
        as="h1"
        style={{
          color: colors.ink,
          fontSize: 24,
          lineHeight: '30px',
          margin: '0 0 12px',
        }}
      >
        {firstName
          ? `Pagamento aprovado, ${firstName}!`
          : 'Pagamento aprovado!'}
      </Heading>
      <Text
        style={{
          color: colors.ink,
          fontSize: 16,
          lineHeight: '24px',
          margin: '0 0 24px',
        }}
      >
        Seu ingresso para <strong>{props.eventName}</strong> está garantido.
      </Text>

      <Section
        style={{
          border: `1px solid ${colors.line}`,
          borderRadius: 8,
          padding: '20px 20px 4px',
        }}
      >
        <Text style={label}>Evento</Text>
        <Text style={value}>{props.eventName}</Text>
        <Text style={label}>Quando</Text>
        <Text style={value}>{formatEventDate(props.eventStartsAt)}</Text>
        <Text style={label}>Onde</Text>
        <Text style={value}>{props.eventLocation}</Text>
        <Text style={label}>Ingresso</Text>
        <Text style={value}>
          {`#${props.ticketId} · ${formatMoney(props.amountCents, props.currency)}`}
        </Text>
      </Section>

      <Section style={{ margin: '28px 0 0' }}>
        <Button
          href={props.myTicketsUrl}
          style={{
            backgroundColor: colors.accent,
            borderRadius: 6,
            color: '#FFFFFF',
            fontSize: 15,
            fontWeight: 600,
            padding: '12px 20px',
          }}
        >
          Ver meus ingressos
        </Button>
      </Section>
    </EmailLayout>
  );
}
