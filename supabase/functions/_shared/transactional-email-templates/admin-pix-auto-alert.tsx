import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  date?: string
  lostAuthorizations?: number
  recoveryEmailsSent?: number
  lines?: string[]
}

// Alerta interno (admin) da auditoria diária de PIX Automático.
// Enviado pela infra de e-mail do projeto — o domínio da Resend direta não é verificado.
const Email = ({ date, lostAuthorizations = 0, recoveryEmailsSent = 0, lines = [] }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Auditoria PIX Automático {date || ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Auditoria PIX Automático — {date || ''}</Heading>

        <Text style={text}>
          <strong>{lostAuthorizations}</strong> autorização(ões) expiraram sem consentimento nas
          últimas 48h · <strong>{recoveryEmailsSent}</strong> e-mail(s) de recuperação enviado(s).
        </Text>

        <Text style={text}>
          <strong>{lines.length}</strong> cobrança(s) de autorização ativa venceram sem débito
          automático:
        </Text>

        <Section>
          {lines.length === 0 ? (
            <Text style={item}>Nenhuma.</Text>
          ) : (
            lines.map((l, i) => (
              <Text key={i} style={item}>• {l}</Text>
            ))
          )}
        </Section>

        <Hr style={hr} />
        <Text style={footer}>Alerta automático · Aura Monitor</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `PIX Automático — ${(data?.lines?.length ?? 0)} débito(s) não disparado(s), ${data?.lostAuthorizations ?? 0} autorização(ões) perdida(s)`,
  displayName: 'Admin — auditoria PIX Automático',
  previewData: {
    date: '2026-07-30',
    lostAuthorizations: 2,
    recoveryEmailsSent: 2,
    lines: ['cliente@exemplo.com · Direção · venc. 2026-07-06 · OVERDUE · cobrança venceu sem débito automático'],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "Arial, sans-serif" }
const container = { padding: '28px 24px', maxWidth: '640px', margin: '0 auto' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#b45309', margin: '0 0 18px' }
const text = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0 0 12px' }
const item = { fontSize: '13px', color: '#4b5563', lineHeight: '1.5', margin: '0 0 6px' }
const hr = { borderColor: '#e5e7eb', margin: '20px 0' }
const footer = { fontSize: '11px', color: '#9ca3af', margin: '0' }