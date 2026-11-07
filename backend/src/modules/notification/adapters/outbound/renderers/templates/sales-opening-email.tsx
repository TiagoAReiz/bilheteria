import { Button, Heading, Section, Text } from '@react-email/components';
import type { SalesOpeningData } from '../../../../core/entities/email.js';
import { EmailLayout, colors } from './email-layout.js';
import { formatEventDate, formatTime } from './format.js';

export interface SalesOpeningEmailProps extends SalesOpeningData {
  eventUrl: string;
}

export function salesOpeningSubject(data: SalesOpeningData): string {
  return `As vendas de ${data.eventName} abrem às ${formatTime(data.salesStartsAt)}`;
}

const label = {
  color: colors.muted,
  fontSize: 12,
  letterSpacing: 1,
  margin: '0 0 2px',
  textTransform: 'uppercase' as const,
};
const value = { color: colors.ink, fontSize: 16, margin: '0 0 16px' };

export function SalesOpeningEmail(props: SalesOpeningEmailProps) {
  const firstName = props.userName.trim().split(/\s+/)[0];
  const opening = formatEventDate(props.salesStartsAt);
  return (
    <EmailLayout preview={`As vendas de ${props.eventName} abrem em breve`}>
      <Heading
        as="h1"
        style={{
          color: colors.ink,
          fontSize: 24,
          lineHeight: '30px',
          margin: '0 0 12px',
        }}
      >
        {firstName ? `Prepare-se, ${firstName}!` : 'Prepare-se!'}
      </Heading>
      <Text
        style={{
          color: colors.ink,
          fontSize: 16,
          lineHeight: '24px',
          margin: '0 0 24px',
        }}
      >
        {`As vendas de ${props.eventName}, que está nos seus favoritos, abrem ${opening}.`}
      </Text>

      <Section
        style={{
          border: `1px solid ${colors.line}`,
          borderRadius: 8,
          padding: '20px 20px 4px',
        }}
      >
        <Text style={label}>Abertura das vendas</Text>
        <Text style={value}>{opening}</Text>
        <Text style={label}>Evento</Text>
        <Text style={value}>{formatEventDate(props.eventStartsAt)}</Text>
        <Text style={label}>Onde</Text>
        <Text style={value}>{props.eventLocation}</Text>
      </Section>

      <Section style={{ margin: '28px 0 0' }}>
        <Button
          href={props.eventUrl}
          style={{
            backgroundColor: colors.accent,
            borderRadius: 6,
            color: '#FFFFFF',
            fontSize: 15,
            fontWeight: 600,
            padding: '12px 20px',
          }}
        >
          Ver evento
        </Button>
      </Section>
    </EmailLayout>
  );
}
