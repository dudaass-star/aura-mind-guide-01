

# Plano: Adicionar Insights Proativos e Lembretes ao Site e Guia

## O que adicionar

Duas features novas que a AURA agora possui e que ainda não aparecem no conteúdo público:

1. **Insights Proativos** ("Efeito Oráculo") — A AURA identifica padrões emocionais invisíveis e traz observações antes de você pedir
2. **Lembretes e Agendamentos** — A AURA agenda lembretes por voz ou texto, direto no WhatsApp

## Onde adicionar

### 1. Landing Page — `src/components/Benefits.tsx`
Adicionar 2 novos cards no array `benefits`:
- **"Insights que você não pediu"** — "A AURA percebe padrões no que você sente e traz reflexões antes mesmo de você pedir." (icon: Sparkles)
- **"Lembretes na hora certa"** — "Pediu pra lembrar de algo? A AURA agenda e te avisa no horário exato pelo WhatsApp." (icon: Bell)

### 2. Guia do Usuário — `src/pages/UserGuide.tsx`
Adicionar 2 novas seções (após "Relatório Semanal", antes de "Meditações"):

**Seção "Insights Proativos":**
- Explicar que a AURA observa padrões ao longo das semanas
- Exemplos: correlação entre certas situações e humor, ciclos emocionais recorrentes
- Destacar que é automático — ela traz quando percebe algo relevante

**Seção "Lembretes":**
- 3 cards: "Por texto ou áudio" (basta pedir naturalmente), "Horário exato" (daqui a 10 min ou amanhã às 9h), "Cancela fácil" (diga "cancela meu lembrete")
- Exemplo prático: "Me lembra daqui a 30 min de tomar o remédio"
- Nota: sem precisar de outro app, tudo pelo WhatsApp

### 3. Landing Page — `src/components/HowItWorks.tsx` (ajuste menor)
Não precisa mudar estrutura, mas pode mencionar lembretes na descrição do step 1 como reforço.

## Arquivos editados
- `src/components/Benefits.tsx` — 2 novos cards
- `src/pages/UserGuide.tsx` — 2 novas seções

## Tom
Manter linguagem humanizada, sem mencionar "IA". Focar no benefício emocional e na praticidade.

