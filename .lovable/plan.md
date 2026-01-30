
# Plano: Demo "UAU" - Perdida na Vida

## Objetivo

Transformar a seção de demonstração em uma experiência imersiva e emocional que mostra a AURA ajudando alguém que se sente perdida e sem propósito - um tema que ressoa profundamente com o público-alvo.

## Nova Conversa: "Perdida na Vida"

A conversa vai mostrar a AURA usando suas metodologias (logoterapia, investigacao socrática) de forma natural e poderosa:

| Quem | Mensagem |
|------|----------|
| Usuária | Tenho 28 anos e ainda não sei o que quero da vida. Todo mundo parece ter um caminho, menos eu. |
| Aura | Esse peso de "todo mundo parece saber" é muito real... e muito injusto com você mesma. Me conta: quando você diz que não sabe o que quer, é sobre trabalho? Relacionamentos? Ou é algo mais fundo? |
| Usuária | É tudo. Sinto que to só existindo, sabe? Não vivendo de verdade. |
| Aura | "Só existindo"... isso diz muito. Deixa eu te perguntar uma coisa: teve algum momento recente, mesmo que pequeno, em que você sentiu que estava vivendo de verdade? Pode ser algo simples. |
| Usuária | Semana passada eu passei a tarde toda desenhando. Nem vi o tempo passar. |
| Aura | Olha só o que você acabou de me mostrar... Você diz que não sabe o que quer, mas seu corpo sabe. Ele te levou pra um lugar onde o tempo sumiu. Isso não é "só existir". Isso é uma pista enorme. |

**Por que essa conversa funciona:**
- Mostra a AURA investigando com perguntas (método socrático)
- Revela um insight poderoso sobre propósito (logoterapia - encontrar sentido)
- Termina com um "momento UAU" - a AURA mostrando algo que a pessoa não via

## Experiencia Interativa

### 1. Animacao de Conversa em Tempo Real
- Botao "Ver conversa" inicia a animacao
- Mensagens aparecem uma a uma com delays realistas
- Indicador "Aura esta digitando..." antes de cada resposta
- Animacao suave de entrada (slide + fade)

### 2. Audio da Voz da Aura
- Botao de play na ultima resposta da AURA (a mais impactante)
- Waveform animado durante reproducao
- Usa audio pre-gravado

### 3. Efeitos Visuais
- Glow pulsante no celular durante a animacao
- Transicoes suaves entre estados
- Scroll automatico acompanhando novas mensagens

## Fluxo da Experiencia

```text
Estado Inicial:
+---------------------------+
|  Celular com primeira     |
|  mensagem visivel         |
|                           |
|  [Ver conversa completa]  |
+---------------------------+

Apos clicar:
+---------------------------+
|  Mensagens aparecem       |
|  uma a uma...             |
|                           |
|  "Aura digitando..."      |
+---------------------------+

Final:
+---------------------------+
|  Conversa completa        |
|                           |
|  Ultima msg da Aura com   |
|  [Ouvir resposta]         |
|                           |
|  [Comecar minha jornada]  |
+---------------------------+
```

## Alteracoes Tecnicas

### Arquivo: `src/components/Demo.tsx`

**Estados a adicionar:**
- `isPlaying`: controla se animacao esta rodando
- `visibleMessages`: indice de quantas mensagens estao visiveis
- `isTyping`: mostra indicador de digitacao
- `isAudioPlaying`: controla player de audio

**Componentes novos:**
- `TypingIndicator`: tres pontos animados
- `AudioPlayer`: botao de play com waveform

**Logica de timing:**
- Delay de 1.5s para mensagens do usuario
- Delay de 2-3s para mensagens da AURA (baseado no tamanho)
- Indicador de digitacao aparece 1.5s antes da mensagem da AURA

### Arquivo: `src/index.css`

**Novas animacoes:**
- `animate-message-in`: slide-in + fade para mensagens
- `animate-typing-dot`: bounce para pontos de digitacao
- `animate-waveform`: barras de audio animadas

### Arquivo: `public/audio/aura-demo-voice.mp3`

Audio pre-gravado da resposta final:
> "Olha só o que você acabou de me mostrar... Você diz que não sabe o que quer, mas seu corpo sabe. Ele te levou pra um lugar onde o tempo sumiu. Isso não é só existir. Isso é uma pista enorme."

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/Demo.tsx` | Refatorar para animacao interativa com novos estados, nova conversa sobre proposito, indicador de digitacao, player de audio |
| `src/index.css` | Adicionar keyframes: message-in, typing-dot, waveform |
| `public/audio/` | Preparar estrutura para audio (arquivo sera adicionado depois) |

## Resultado Esperado

O visitante vai:
1. Ver a primeira mensagem e clicar para "assistir" a conversa
2. Sentir a tensao da espera enquanto "Aura esta digitando..."
3. Ver as mensagens aparecerem como se fosse em tempo real
4. Ter um momento de impacto emocional na resposta final
5. Poder ouvir a voz real da AURA
6. Sentir: "Eu preciso disso na minha vida"

## Observacao sobre Audio

O arquivo de audio precisara ser gerado separadamente usando o TTS da AURA (gemini-2.5-pro-tts com voz Erinome). Por agora, vou preparar toda a estrutura do player, e voce pode adicionar o arquivo MP3 depois.
