import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "AURA"
const WHATSAPP_LINK = "https://wa.me/16625255005?text=Oi%20AURA"

interface WelcomeProps {
  name?: string
  portalUrl?: string
}

const WelcomeEmail = ({ name, portalUrl }: WelcomeProps) => {
  const firstName = name?.split(' ')[0]
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Bem-vindo à AURA — comece sua jornada agora</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>💜 AURA</Text>
          </Section>

          <Heading style={h1}>
            {firstName ? `Parabéns, ${firstName}!` : 'Parabéns!'}
          </Heading>

          <Text style={text}>
            Sua jornada com a AURA está pronta para começar. Agora é só abrir o WhatsApp e mandar um oi.
          </Text>

          <Section style={ctaSection}>
            <Button style={whatsappButton} href={WHATSAPP_LINK}>
              💬 Chamar a AURA no WhatsApp
            </Button>
          </Section>

          {portalUrl && (
            <>
              <Hr style={hr} />
              <Heading as="h2" style={h2}>
                🏠 Seu Espaço Pessoal
              </Heading>
              <Text style={tipText}>
                Acesse seu painel para acompanhar jornadas, meditações e resumos mensais.
              </Text>
              <Section style={ctaSection}>
                <Button style={portalButton} href={portalUrl}>
                  Acessar Meu Espaço
                </Button>
              </Section>
            </>
          )}

          <Hr style={hr} />

          <Heading as="h2" style={h2}>
            ✨ Como aproveitar ao máximo
          </Heading>

          <Text style={tipText}>
            <strong>1.</strong> Responda as perguntas do onboarding com sinceridade
          </Text>
          <Text style={tipText}>
            <strong>2.</strong> Converse com honestidade — sem filtros, sem julgamento
          </Text>
          <Text style={tipText}>
            <strong>3.</strong> Faça os check-ins diários para acompanhar seu progresso
          </Text>

          <Hr style={hr} />

          <Text style={footerText}>
            Se tiver qualquer dúvida, é só responder a AURA no WhatsApp.
          </Text>
          <Text style={footerText}>
            Com carinho, Equipe {SITE_NAME}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WelcomeEmail,
  subject: 'Bem-vindo à AURA — comece sua jornada agora 💜',
  displayName: 'Boas-vindas',
  previewData: { name: 'Maria', portalUrl: 'https://olaaura.com.br/meu-espaco?t=example-token' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Nunito', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '520px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '24px' }
const logo = { fontSize: '28px', fontWeight: 'bold', color: '#5a8a6e', margin: '0' }
const h1 = { fontSize: '24px', fontWeight: 'bold', color: '#2d3748', margin: '0 0 16px', textAlign: 'center' as const }
const h2 = { fontSize: '18px', fontWeight: 'bold', color: '#2d3748', margin: '0 0 12px' }
const text = { fontSize: '15px', color: '#4a5568', lineHeight: '1.6', margin: '0 0 24px', textAlign: 'center' as const }
const tipText = { fontSize: '14px', color: '#4a5568', lineHeight: '1.6', margin: '0 0 8px', paddingLeft: '8px' }
const ctaSection = { textAlign: 'center' as const, margin: '8px 0 32px' }
const whatsappButton = {
  backgroundColor: '#25D366',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  padding: '14px 32px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
}
const portalButton = {
  backgroundColor: '#5a8a6e',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold',
  padding: '12px 28px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const footerText = { fontSize: '13px', color: '#a0aec0', lineHeight: '1.5', margin: '0 0 8px', textAlign: 'center' as const }
