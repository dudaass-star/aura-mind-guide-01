import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface PlanLimitProps {
  name?: string
  limit?: number
  portalUrl?: string
}

// Aviso de conta: o usuário atingiu a cota de mensagens do mês no plano atual.
const PlanLimitEmail = ({ name, limit = 30, portalUrl = 'https://olaaura.com.br/meu-espaco' }: PlanLimitProps) => {
  const firstName = name?.split(' ')[0]
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Você atingiu o limite de mensagens do seu plano neste mês</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>💜 AURA</Text>
          </Section>

          <Heading style={h1}>
            {firstName ? `${firstName}, você chegou ao limite do mês` : 'Você chegou ao limite do mês'}
          </Heading>

          <Text style={text}>
            Seu plano atual inclui {limit} mensagens por mês e elas já foram usadas. Seu histórico,
            insights e sessões continuam salvos — a conversa volta automaticamente no dia 1º.
          </Text>

          <Text style={text}>
            Se preferir voltar ao ritmo normal antes disso, você pode ajustar seu plano no seu espaço.
          </Text>

          <Section style={ctaSection}>
            <Button style={portalButton} href={portalUrl}>
              Ver meu plano
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footerText}>Equipe AURA</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: PlanLimitEmail,
  subject: 'Você atingiu o limite de mensagens do seu plano neste mês',
  displayName: 'Limite de mensagens do plano',
  previewData: { name: 'Maria', limit: 30, portalUrl: 'https://olaaura.com.br/meu-espaco' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Nunito', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '520px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '24px' }
const logo = { fontSize: '28px', fontWeight: 'bold', color: '#5a8a6e', margin: '0' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#2d3748', margin: '0 0 16px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: '#4a5568', lineHeight: '1.6', margin: '0 0 16px' }
const ctaSection = { textAlign: 'center' as const, margin: '8px 0 24px' }
const portalButton = {
  backgroundColor: '#1B2A4E',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold',
  padding: '12px 28px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const footerText = { fontSize: '13px', color: '#a0aec0', lineHeight: '1.5', margin: '0', textAlign: 'center' as const }