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

// Estágio 3 — Última chance + garantia (72h após estágio 2)
const Email = ({ name, plan, checkoutLink }: Props) => {
  const baseLink = checkoutLink || `https://olaaura.com.br/checkout`
  const sep = baseLink.includes('?') ? '&' : '?'
  const utm = `${sep}utm_source=email&utm_medium=recovery&utm_campaign=stage3`
  const link = (planParam: string) => `https://olaaura.com.br/checkout?plan=${planParam}&utm_source=email&utm_medium=recovery&utm_campaign=stage3`

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Última vez que falo sobre isso 🤍</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>💜 AURA</Text>
          </Section>

          <Heading style={h1}>
            {name ? `${name}, vou ser direto.` : 'Vou ser direto.'}
          </Heading>

          <Text style={text}>
            Essa é a última vez que te escrevo sobre isso. Não quero ser chato.
          </Text>

          <Text style={text}>
            Mas antes de você fechar essa porta, preciso deixar uma coisa clara:
          </Text>

          <Section style={guaranteeBox}>
            <Text style={guaranteeTitle}>✓ Você cancela quando quiser, em 1 clique</Text>
            <Text style={guaranteeItem}>✓ Sem letra miúda, sem multa, sem ligação</Text>
            <Text style={guaranteeItem}>✓ Se não fizer sentido pra você, sai. Simples assim.</Text>
          </Section>

          <Text style={text}>
            Escolha o plano que faz sentido pro seu momento:
          </Text>

          <Section style={plansSection}>
            <Text style={planRow}>
              <strong>Essencial</strong> — R$ 29,90/mês
              <br />
              <a style={planLink} href={link('essencial')}>Começar Essencial →</a>
            </Text>
            <Hr style={planDivider} />
            <Text style={planRow}>
              <strong>Direção</strong> — R$ 49,90/mês <span style={badge}>mais escolhido</span>
              <br />
              <a style={planLink} href={link('direcao')}>Começar Direção →</a>
            </Text>
            <Hr style={planDivider} />
            <Text style={planRow}>
              <strong>Transformação</strong> — R$ 79,90/mês
              <br />
              <a style={planLink} href={link('transformacao')}>Começar Transformação →</a>
            </Text>
          </Section>

          <Text style={textSmall}>
            Se decidir não seguir, tudo bem também. Te desejo o melhor de qualquer jeito. 🤍
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
  component: Email,
  subject: 'Última vez que falo sobre isso 🤍',
  displayName: 'Recuperação checkout — 3/3 (garantia)',
  previewData: { name: 'Maria', plan: 'direcao', checkoutLink: 'https://olaaura.com.br/checkout?plan=direcao' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Nunito', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '520px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '20px' }
const logo = { fontSize: '20px', fontWeight: 'bold' as const, color: '#5a8a6e' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#2d3748', margin: '0 0 20px', fontFamily: "'Fraunces', Georgia, serif" }
const text = { fontSize: '15px', color: '#4a5568', lineHeight: '1.6', margin: '0 0 16px' }
const textSmall = { fontSize: '13px', color: '#718096', lineHeight: '1.5', margin: '16px 0' }
const guaranteeBox = { backgroundColor: '#f7faf7', padding: '16px 20px', margin: '20px 0', borderRadius: '8px' }
const guaranteeTitle = { fontSize: '14px', color: '#2d3748', fontWeight: 'bold' as const, margin: '0 0 8px' }
const guaranteeItem = { fontSize: '14px', color: '#4a5568', margin: '4px 0' }
const plansSection = { margin: '20px 0' }
const planRow = { fontSize: '15px', color: '#2d3748', lineHeight: '1.8', margin: '12px 0' }
const planLink = { color: '#5a8a6e', fontWeight: 'bold' as const, textDecoration: 'none', fontSize: '14px' }
const planDivider = { borderColor: '#e2e8f0', margin: '8px 0' }
const badge = { fontSize: '11px', backgroundColor: '#5a8a6e', color: '#ffffff', padding: '2px 8px', borderRadius: '10px', marginLeft: '6px' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#a0aec0', margin: '0', textAlign: 'center' as const }