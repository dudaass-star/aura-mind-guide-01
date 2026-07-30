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

// Recuperação de autorização de PIX Automático que expirou sem consentimento.
// O cliente chegou ao QR e não concluiu a etapa de "autorizar cobrança
// automática" dentro do app do banco. O e-mail explica exatamente essa etapa.
const Email = ({ name, plan, checkoutLink }: Props) => {
  const planLabel = plan ? (PLAN_LABELS[plan] || plan) : ''
  const link = checkoutLink || `https://olaaura.com.br/v2${plan ? `?plan=${plan}` : ''}`

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Faltou só um passo pra sua assinatura começar</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>💜 AURA</Text>
          </Section>

          <Heading style={h1}>{name ? `Oi, ${name}!` : 'Oi!'}</Heading>

          <Text style={text}>
            Você gerou o PIX{planLabel ? ` do plano ${planLabel}` : ''}, mas o código expirou antes
            de ser concluído. Sem drama — dá pra retomar em um minuto.
          </Text>

          <Section style={box}>
            <Text style={boxTitle}>O passo que costuma passar batido</Text>
            <Text style={boxText}>
              No PIX recorrente, o app do banco pede <strong>duas confirmações</strong>: o pagamento
              e a <strong>autorização da cobrança automática mensal</strong>. É a segunda que ativa
              sua assinatura — se ela não for marcada, nada acontece.
            </Text>
            <Text style={boxText}>
              Você pode cancelar essa autorização quando quiser, direto no app do banco ou falando
              com a gente.
            </Text>
          </Section>

          <Section style={buttonSection}>
            <Button style={button} href={link}>
              Gerar um novo PIX
            </Button>
          </Section>

          <Text style={text}>
            Se preferir pagar menos vezes, o PIX também aceita <strong>trimestral, semestral e
            anual</strong> — mesma autorização, menos cobranças ao longo do ano.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>Com carinho, equipe {SITE_NAME}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: 'Faltou um passo pra sua assinatura começar',
  displayName: 'PIX Automático — autorização não concluída',
  previewData: { name: 'Maria', plan: 'essencial', checkoutLink: 'https://olaaura.com.br/v2?plan=essencial&utm_source=email&utm_medium=recovery&utm_campaign=pix_auto' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Nunito', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '520px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '20px' }
const logo = { fontSize: '20px', fontWeight: 'bold' as const, color: '#5a8a6e' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#2d3748', margin: '0 0 20px', fontFamily: "'Fraunces', Georgia, serif" }
const text = { fontSize: '15px', color: '#4a5568', lineHeight: '1.6', margin: '0 0 16px' }
const box = { backgroundColor: '#f4f7f5', borderRadius: '12px', padding: '16px 18px', margin: '0 0 8px' }
const boxTitle = { fontSize: '14px', fontWeight: 'bold' as const, color: '#2d3748', margin: '0 0 8px' }
const boxText = { fontSize: '14px', color: '#4a5568', lineHeight: '1.6', margin: '0 0 10px' }
const buttonSection = { textAlign: 'center' as const, margin: '24px 0' }
const button = { backgroundColor: '#5a8a6e', color: '#ffffff', padding: '14px 28px', borderRadius: '12px', fontSize: '15px', fontWeight: 'bold' as const, textDecoration: 'none' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#a0aec0', margin: '0', textAlign: 'center' as const }