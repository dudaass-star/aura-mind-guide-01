/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  token?: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
  token,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirme seu e-mail para acessar a Aura</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Bem-vindo à Aura 💜</Heading>
        <Text style={text}>
          Que bom ter você por aqui. Antes de continuar, confirme seu e-mail (
          <Link href={`mailto:${recipient}`} style={link}>{recipient}</Link>
          ) para liberar seu espaço pessoal.
        </Text>
        {token && (
          <>
            <Text style={codeLabel}>Código de acesso</Text>
            <Text style={codeValue}>{token}</Text>
            <Text style={codeHelper}>Ou toque no botão para confirmar direto:</Text>
          </>
        )}
        <Button style={button} href={confirmationUrl}>
          Confirmar e-mail
        </Button>
        <Text style={footer}>
          Se você não criou uma conta na Aura, pode ignorar este e-mail tranquilamente.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '520px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 600 as const,
  color: 'hsl(220, 25%, 20%)',
  margin: '0 0 20px',
}
const text = {
  fontSize: '15px',
  color: 'hsl(220, 15%, 35%)',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const link = { color: 'hsl(155, 30%, 38%)', textDecoration: 'underline' }
const button = {
  backgroundColor: 'hsl(155, 30%, 45%)',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600 as const,
  borderRadius: '16px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '12px', color: 'hsl(220, 10%, 55%)', margin: '32px 0 0', lineHeight: '1.5' }
const codeLabel = { fontSize: '12px', color: 'hsl(220, 10%, 55%)', textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 8px' }
const codeValue = { fontSize: '36px', fontWeight: 700 as const, color: 'hsl(155, 30%, 35%)', letterSpacing: '6px', margin: '0 0 16px' }
const codeHelper = { fontSize: '14px', color: 'hsl(220, 15%, 35%)', margin: '0 0 20px' }
