/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
  token?: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
  token,
}: MagicLinkEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de acesso à Aura</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Seu acesso 💜</Heading>
        <Text style={text}>
          Use o código abaixo para entrar no seu espaço na Aura. Ele expira em alguns minutos.
        </Text>

        {token && (
          <>
            <Text style={codeLabel}>Código de acesso</Text>
            <Text style={codeValue}>{token}</Text>
            <Text style={codeHelper}>Ou toque no botão para entrar direto:</Text>
          </>
        )}

        {!token && (
          <Text style={text}>
            Toque no botão abaixo para entrar no seu espaço na Aura.
          </Text>
        )}

        <Button style={button} href={confirmationUrl}>
          Entrar na Aura
        </Button>
        <Text style={footer}>
          Se você não pediu este link, pode ignorar este e-mail tranquilamente.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '520px' }
const h1 = { fontSize: '24px', fontWeight: 600 as const, color: 'hsl(220, 25%, 20%)', margin: '0 0 20px' }
const text = { fontSize: '15px', color: 'hsl(220, 15%, 35%)', lineHeight: '1.6', margin: '0 0 24px' }
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
