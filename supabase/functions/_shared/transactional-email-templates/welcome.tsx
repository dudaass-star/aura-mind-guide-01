import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Olá Aura"
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
      <Preview>Seu acesso ao app Olá Aura está liberado</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>Olá Aura</Text>
          </Section>

          <Heading style={h1}>
            {firstName ? `Parabéns, ${firstName}!` : 'Parabéns!'}
          </Heading>

          <Text style={text}>
            Seu acesso ao app Olá Aura está liberado. É nele que você conversa com a AURA e encontra tudo o que acompanha sua jornada.
          </Text>

          {portalUrl && (
            <>
              <Section style={ctaSection}>
                <Button style={portalButton} href={portalUrl}>
                  Abrir o app Olá Aura
                </Button>
              </Section>
            </>
          )}

          <Hr style={hr} />

          <Heading as="h2" style={h2}>
            Tudo em um só lugar
          </Heading>

          <Text style={tipText}>
            <strong>Conversa:</strong> fale com a AURA por texto ou áudio, no seu ritmo.
          </Text>
          <Text style={tipText}>
            <strong>Sessões e Jornadas:</strong> aprofunde o que importa com encontros e conteúdos guiados.
          </Text>
          <Text style={tipText}>
            <strong>Percurso e Meditações:</strong> acompanhe o que vem mudando e encontre práticas para diferentes momentos.
          </Text>

          <Hr style={hr} />

          <Text style={footerText}>
            Se precisar de ajuda para entrar, fale com a AURA pelo WhatsApp.
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
  subject: 'Seu acesso ao app Olá Aura está liberado',
  displayName: 'Boas-vindas',
  previewData: { name: 'Maria', portalUrl: 'https://olaaura.com.br/meu-espaco' },
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
