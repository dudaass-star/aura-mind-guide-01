import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "AURA"

interface DunningProps {
  name?: string
  paymentLink?: string
}

const DunningPaymentFailedEmail = ({ name, paymentLink }: DunningProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Não conseguimos processar seu pagamento da AURA</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Text style={logo}>💜 AURA</Text>
        </Section>

        <Heading style={h1}>
          {name ? `Oi, ${name}!` : 'Oi!'}
        </Heading>

        <Text style={text}>
          Não conseguimos processar seu último pagamento da AURA.
        </Text>

        <Text style={text}>
          Isso pode acontecer por vários motivos — cartão expirado, limite, ou algo temporário. Sem estresse. 💜
        </Text>

        {paymentLink && (
          <Section style={buttonSection}>
            <Button style={button} href={paymentLink}>
              Atualizar forma de pagamento
            </Button>
          </Section>
        )}

        <Text style={textSmall}>
          Se preferir cancelar sua assinatura, é só responder a este email. Sem problemas.
        </Text>

        <Hr style={hr} />

        <Text style={footer}>
          Com carinho, equipe {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: DunningPaymentFailedEmail,
  subject: 'Precisamos atualizar seu pagamento 💜',
  displayName: 'Falha de pagamento (dunning)',
  previewData: { name: 'Maria', paymentLink: 'https://billing.stripe.com/example' },
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
