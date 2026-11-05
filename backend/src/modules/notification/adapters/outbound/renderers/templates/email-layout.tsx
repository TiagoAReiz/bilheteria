import type { ReactNode } from 'react';
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

// Email não tem CSS externo nem variáveis: estilos inline, fontes do sistema e cores fixas
// com contraste suficiente nos clientes que forçam modo escuro.
export const colors = {
  page: '#EEF1F4',
  card: '#FFFFFF',
  ink: '#14202B',
  muted: '#5A6876',
  line: '#D9DFE5',
  accent: '#1F5E8C',
};

const font =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.page,
          fontFamily: font,
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container
          style={{
            backgroundColor: colors.card,
            borderRadius: 8,
            maxWidth: 560,
            padding: '32px 28px',
          }}
        >
          <Text
            style={{
              color: colors.accent,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 2,
              margin: '0 0 24px',
              textTransform: 'uppercase',
            }}
          >
            Bilheteria
          </Text>
          {children}
          <Hr style={{ borderColor: colors.line, margin: '32px 0 16px' }} />
          <Section>
            <Text
              style={{
                color: colors.muted,
                fontSize: 12,
                lineHeight: '18px',
                margin: 0,
              }}
            >
              Você recebeu este email porque tem uma conta na Bilheteria. Este é
              um email automático; respostas não são lidas.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
