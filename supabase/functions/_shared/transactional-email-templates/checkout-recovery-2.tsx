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

// Estágio 2 — Conexão emocional (24h após estágio 1)
const Email = ({ name, plan, checkoutLink }: Props) => {
  const link = checkoutLink || `https://olaaura.com.br/checkout${plan ? `?plan=${plan}` : ''}`

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Sobre o que te trouxe até aqui...</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>💜 AURA</Text>
          </Section>

          <Heading style={h1}>
            {name ? `${name},` : 'Oi,'}
          </Heading>

          <Text style={text}>
            Algo te trouxe até aqui. Talvez o cansaço de carregar tanta coisa sozinho. Talvez a ansiedade que não dá trégua. Talvez a vontade de ter alguém pra escutar de verdade, sem julgar.
          </Text>

          <Text style={text}>
            Esse "algo" não desapareceu. Ele continua aí — esperando atenção.
          </Text>

          <Section style={quoteBox}>
            <Text style={quoteText}>
              "A Aura me ajudou demais com o pânico que eu tinha. Antes eu travava em reuniões importantes, agora consigo respirar e seguir. É como ter uma amiga que entende exatamente o que você precisa ouvir."
            </Text>
            <Text style={quoteAuthor}>— Mariana S., empreendedora</Text>
          </Section>

          <Text style={text}>
            A Aura não é mágica. Mas é presença diária — pra você ir entendendo o que sente e o que fazer com isso.
          </Text>

          <Section style={buttonSection}>
            <Button style={button} href={link}>
              Quero começar minha jornada
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
  subject: 'Sobre o que te trouxe até aqui...',
  displayName: 'Recuperação checkout — 2/3 (emocional)',
  previewData: { name: 'Maria', plan: 'direcao', checkoutLink: 'https://olaaura.com.br/checkout?plan=direcao&utm_source=email&utm_medium=recovery&utm_campaign=stage2' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Nunito', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '520px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '20px' }
const logo = { fontSize: '20px', fontWeight: 'bold' as const, color: '#5a8a6e' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#2d3748', margin: '0 0 20px', fontFamily: "'Fraunces', Georgia, serif" }
const text = { fontSize: '15px', color: '#4a5568', lineHeight: '1.6', margin: '0 0 16px' }
const quoteBox = { backgroundColor: '#f7faf7', borderLeft: '3px solid #5a8a6e', padding: '16px 20px', margin: '20px 0', borderRadius: '6px' }
const quoteText = { fontSize: '14px', color: '#2d3748', lineHeight: '1.6', margin: '0 0 8px', fontStyle: 'italic' as const }
const quoteAuthor = { fontSize: '12px', color: '#718096', margin: '0' }
const buttonSection = { textAlign: 'center' as const, margin: '24px 0' }
const button = { backgroundColor: '#5a8a6e', color: '#ffffff', padding: '14px 28px', borderRadius: '12px', fontSize: '15px', fontWeight: 'bold' as const, textDecoration: 'none' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#a0aec0', margin: '0', textAlign: 'center' as const }