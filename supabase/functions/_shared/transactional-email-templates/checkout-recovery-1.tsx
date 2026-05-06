import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "AURA"

interface Props {
  name?: string
  plan?: string
  checkoutLink?: string
}

const PLAN_LABELS: Record<string, string> = {
  essencial: 'Essencial',
  direcao: 'Direção',
  transformacao: 'Transformação',
}

// Estágio 1 — Lembrete suave (1h após abandono)
const Email = ({ name, plan, checkoutLink }: Props) => {
  const planLabel = plan ? (PLAN_LABELS[plan] || plan) : ''
  const link = checkoutLink || `https://olaaura.com.br/checkout${plan ? `?plan=${plan}` : ''}`

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Você esqueceu algo por aqui 💜</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>💜 AURA</Text>
          </Section>

          <Heading style={h1}>
            {name ? `Oi, ${name}!` : 'Oi!'}
          </Heading>

          <Text style={text}>
            Vi que você começou a entrar e parou no meio do caminho. Tá tudo bem por aí?
          </Text>

          <Text style={text}>
            Sem pressão — só queria deixar a porta aberta caso queira continuar de onde parou.
          </Text>

          {planLabel && (
            <Text style={text}>
              Seu plano <strong>{planLabel}</strong> ainda está reservado.
            </Text>
          )}

          <Section style={buttonSection}>
            <Button style={button} href={link}>
              Continuar de onde parei
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            Com carinho, equipe {SITE_NAME}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'Você esqueceu algo 💜',
  displayName: 'Recuperação checkout — 1/3 (lembrete)',
  previewData: { name: 'Maria', plan: 'direcao', checkoutLink: 'https://olaaura.com.br/checkout?plan=direcao&utm_source=email&utm_medium=recovery&utm_campaign=stage1' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Nunito', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '520px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '20px' }
const logo = { fontSize: '20px', fontWeight: 'bold' as const, color: '#5a8a6e' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#2d3748', margin: '0 0 20px', fontFamily: "'Fraunces', Georgia, serif" }
const text = { fontSize: '15px', color: '#4a5568', lineHeight: '1.6', margin: '0 0 16px' }
const buttonSection = { textAlign: 'center' as const, margin: '24px 0' }
const button = { backgroundColor: '#5a8a6e', color: '#ffffff', padding: '14px 28px', borderRadius: '12px', fontSize: '15px', fontWeight: 'bold' as const, textDecoration: 'none' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#a0aec0', margin: '0', textAlign: 'center' as const }