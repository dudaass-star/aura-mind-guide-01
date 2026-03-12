

# Reorganizar o rodapé para um layout mais coeso

## Problema
O layout atual em 3 colunas (logo, links, suporte) deixa o email de suporte isolado no canto direito, sem harmonia visual com o resto.

## Proposta
Centralizar tudo e integrar o email de suporte de forma natural:

1. **Logo centralizada** no topo do footer
2. **Links de navegação** centralizados abaixo
3. **Email de suporte** como mais um item na mesma linha dos links (ou logo abaixo, com um ícone de email discreto)
4. **Trust badges** e copyright como já estão

Layout vertical centralizado:

```text
        [Logo Olá AURA]

  Termos · Privacidade · Cancelar
     suporte@olaaura.com.br

  [Conforme LGPD]  [Dados criptografados]

  © 2026 AURA. Todos os direitos reservados.
  AURA é acompanhamento emocional...
```

## Arquivo
- `src/components/Footer.tsx` — substituir o layout flex row por layout centralizado vertical

