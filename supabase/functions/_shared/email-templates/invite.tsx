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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Você foi convidado para a Aura</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Você foi convidado 💜</Heading>
        <Text style={text}>
          Você foi convidado para entrar na{' '}
          <Link href={siteUrl} style={link}><strong>Aura</strong></Link>.
          Toque no botão abaixo para aceitar e criar sua conta.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Aceitar convite
        </Button>
        <Text style={footer}>
          Se você não esperava este convite, pode ignorar este e-mail tranquilamente.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '520px' }
const h1 = { fontSize: '24px', fontWeight: 600 as const, color: 'hsl(220, 25%, 20%)', margin: '0 0 20px' }
const text = { fontSize: '15px', color: 'hsl(220, 15%, 35%)', lineHeight: '1.6', margin: '0 0 24px' }
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
