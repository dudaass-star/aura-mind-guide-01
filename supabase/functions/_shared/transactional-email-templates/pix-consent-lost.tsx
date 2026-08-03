import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "AURA"

interface Props {
  name?: string
  plan?: string
  accessUntil?: string
}

const PLAN_LABELS: Record<string, string> = {
  essencial: 'Essencial',
  direcao: 'Direção',
  transformacao: 'Transformação',
}

function brDate(iso?: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

// Aviso informativo: o consentimento de PIX Automático foi cancelado no app do
// banco. Sem QR aqui de propósito — o QR de reautorização cobra na hora, então
// ele só é enviado perto do vencimento.
const Email = ({ name, plan, accessUntil }: Props) => {
  const planLabel = plan ? (PLAN_LABELS[plan] || plan) : ''
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Sua renovação automática do PIX foi desativada</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>💜 AURA</Text>
          </Section>

          <Heading style={h1}>{name ? `Oi, ${name}!` : 'Oi!'}</Heading>

          <Text style={text}>
            Recebemos do seu banco o aviso de que a <strong>autorização de cobrança automática
            por PIX</strong>{planLabel ? ` do plano ${planLabel}` : ''} foi cancelada. Pode ter sido
            você mesmo, no app do banco — é totalmente do seu direito.
          </Text>

          <Section style={box}>
            <Text style={boxTitle}>O que muda agora</Text>
            <Text style={boxText}>
              Nada muda até {accessUntil ? brDate(accessUntil) : 'o fim do seu ciclo atual'}: seu
              acesso à Aura continua normal, porque esse período já está pago.
            </Text>
            <Text style={boxText}>
              O que não vai acontecer é a renovação automática. Perto do vencimento a gente te manda
              um link pra reativar em um minuto — ou trocar pra cartão, se preferir.
            </Text>
          </Section>

          <Text style={text}>
            Se o cancelamento foi engano, é só esperar esse próximo e-mail. Se você quis mesmo
            encerrar, também está tudo certo — nenhuma cobrança será feita.
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
  subject: 'Sua renovação automática por PIX foi desativada',
  displayName: 'PIX Automático — consentimento cancelado no banco',
  previewData: { name: 'Maria', plan: 'essencial', accessUntil: '2026-09-03' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Nunito', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '520px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '20px' }
const logo = { fontSize: '20px', fontWeight: 'bold' as const, color: '#5a8a6e' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#2d3748', margin: '0 0 20px', fontFamily: "'Fraunces', Georgia, serif" }
const text = { fontSize: '15px', color: '#4a5568', lineHeight: '1.6', margin: '0 0 16px' }
const box = { backgroundColor: '#f4f7f5', borderRadius: '12px', padding: '16px 18px', margin: '0 0 16px' }
const boxTitle = { fontSize: '14px', fontWeight: 'bold' as const, color: '#2d3748', margin: '0 0 8px' }
const boxText = { fontSize: '14px', color: '#4a5568', lineHeight: '1.6', margin: '0 0 10px' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#a0aec0', margin: '0', textAlign: 'center' as const }