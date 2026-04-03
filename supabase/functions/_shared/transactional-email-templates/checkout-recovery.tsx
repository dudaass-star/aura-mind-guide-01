import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "AURA"

interface RecoveryProps {
  name?: string
  plan?: string
  checkoutLink?: string
}

const PLAN_LABELS: Record<string, string> = {
  essencial: 'Essencial',
  direcao: 'Direção',
  transformacao: 'Transformação',
}

const CheckoutRecoveryEmail = ({ name, plan, checkoutLink }: RecoveryProps) => {
  const planLabel = plan ? (PLAN_LABELS[plan] || plan) : ''
  const link = checkoutLink || `https://olaaura.com.br/checkout${plan ? `?plan=${plan}` : ''}`

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Você estava quase lá! Continue sua jornada com a AURA</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>💜 AURA</Text>
          </Section>

          <Heading style={h1}>
            {name ? `Oi, ${name}!` : 'Oi!'}
          </Heading>

          <Text style={text}>
            Você estava a um passo de começar sua jornada com a Aura — uma companhia que te escuta de verdade, todos os dias, sem julgamento.
          </Text>

          {planLabel && (
            <Text style={text}>
              Seu plano <strong>{planLabel}</strong> ainda está reservado.
            </Text>
          )}

          <Section style={buttonSection}>
            <Button style={button} href={link}>
              Continuar minha jornada
            </Button>
          </Section>

          <Text style={textSmall}>
            Às vezes a gente só precisa de um empurrãozinho pra começar a cuidar de si. Esse pode ser o seu. 🤍
          </Text>

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
  component: CheckoutRecoveryEmail,
  subject: 'Você estava quase lá! 💜',
  displayName: 'Recuperação de checkout abandonado',
  previewData: { name: 'Maria', plan: 'direcao', checkoutLink: 'https://olaaura.com.br/checkout?plan=direcao' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Nunito', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '520px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '20px' }
const logo = { fontSize: '20px', fontWeight: 'bold' as const, color: '#5a8a6e' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#2d3748', margin: '0 0 20px', fontFamily: "'Fraunces', Georgia, serif" }
const text = { fontSize: '15px', color: '#4a5568', lineHeight: '1.6', margin: '0 0 16px' }
const textSmall = { fontSize: '13px', color: '#718096', lineHeight: '1.5', margin: '16px 0' }
const buttonSection = { textAlign: 'center' as const, margin: '24px 0' }
const button = { backgroundColor: '#5a8a6e', color: '#ffffff', padding: '14px 28px', borderRadius: '12px', fontSize: '15px', fontWeight: 'bold' as const, textDecoration: 'none' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#a0aec0', margin: '0', textAlign: 'center' as const }
