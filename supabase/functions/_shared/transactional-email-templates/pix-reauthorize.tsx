import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "AURA"

interface Props {
  name?: string
  plan?: string
  renewalDate?: string
  reauthLink?: string
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

// D-2 do vencimento: link com QR novo. O pagamento desse QR é a cobrança do
// próximo ciclo e, no mesmo escaneamento, reativa a recorrência.
const Email = ({ name, plan, renewalDate, reauthLink }: Props) => {
  const planLabel = plan ? (PLAN_LABELS[plan] || plan) : ''
  const link = reauthLink || 'https://olaaura.com.br/meu-espaco'
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Reative sua renovação automática em um minuto</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>💜 AURA</Text>
          </Section>

          <Heading style={h1}>{name ? `Oi, ${name}!` : 'Oi!'}</Heading>

          <Text style={text}>
            Seu ciclo{planLabel ? ` do plano ${planLabel}` : ''} vence
            {renewalDate ? ` em ${brDate(renewalDate)}` : ' em breve'} e a autorização de cobrança
            automática por PIX está desativada — então nada vai ser debitado sozinho.
          </Text>

          <Text style={text}>
            Pra continuar sem interrupção, é um passo: abrir o link, ler o QR Code no app do banco e
            confirmar. Esse pagamento já é o do próximo ciclo e reativa a renovação automática ao
            mesmo tempo.
          </Text>

          <Section style={buttonSection}>
            <Button style={button} href={link}>
              Reativar minha renovação
            </Button>
          </Section>

          <Section style={box}>
            <Text style={boxTitle}>Atenção a este detalhe</Text>
            <Text style={boxText}>
              O app do banco pede <strong>duas confirmações</strong>: o pagamento e a
              <strong> autorização da cobrança automática</strong>. É a segunda que evita esse
              e-mail no mês que vem.
            </Text>
          </Section>

          <Text style={text}>
            Prefere cartão? Na mesma página tem a opção. E se quiser encerrar, basta ignorar este
            e-mail — seu acesso segue até o fim do ciclo atual.
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
  subject: 'Reative sua renovação automática por PIX',
  displayName: 'PIX Automático — reautorização (D-2)',
  previewData: { name: 'Maria', plan: 'essencial', renewalDate: '2026-09-03', reauthLink: 'https://olaaura.com.br/reautorizar-pix?token=exemplo' },
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
const buttonSection = { textAlign: 'center' as const, margin: '24px 0' }
const button = { backgroundColor: '#5a8a6e', color: '#ffffff', padding: '14px 28px', borderRadius: '12px', fontSize: '15px', fontWeight: 'bold' as const, textDecoration: 'none' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#a0aec0', margin: '0', textAlign: 'center' as const }