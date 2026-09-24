import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  date?: string
  lines?: string[]
}

const Email = ({ date, lines = [] }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Disputa Woovi aberta sem evidência</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Disputa Woovi exige atenção — {date || ''}</Heading>
        <Text style={text}>
          A conferência automática encontrou disputa(s) aberta(s) que continuam sem evidência aceita.
        </Text>
        <Section>
          {lines.map((line, index) => <Text key={index} style={item}>• {line}</Text>)}
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
    `Woovi — ${(data?.lines?.length ?? 0)} disputa(s) aberta(s) sem evidência`,
  displayName: 'Admin — disputas Woovi',
  previewData: {
    date: '24/09/2026',
    lines: ['R$ 6,90 · vínculo automático não encontrado · prazo em andamento'],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '28px 24px', maxWidth: '640px', margin: '0 auto' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#b91c1c', margin: '0 0 18px' }
const text = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0 0 12px' }
const item = { fontSize: '13px', color: '#4b5563', lineHeight: '1.5', margin: '0 0 6px' }
const hr = { borderColor: '#e5e7eb', margin: '20px 0' }
const footer = { fontSize: '11px', color: '#9ca3af', margin: '0' }