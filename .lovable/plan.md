
# Plano: Separar Áudio como Mensagem Independente

## Problema

O áudio está sendo renderizado **dentro** do balão da última mensagem de texto. No WhatsApp, mensagens de voz aparecem como balões separados na conversa.

## Solução

Transformar o áudio em uma **mensagem separada** que aparece após o texto "Isso é uma pista enorme".

## Alterações Técnicas

### Arquivo: `src/components/Demo.tsx`

**1. Atualizar interface Message (linhas 6-12)**

Adicionar propriedade `isAudioOnly` para identificar mensagens que são apenas áudio:

```typescript
interface Message {
  sender: "user" | "aura";
  content: string;
  time?: string;
  hasAudio?: boolean;      // remover (não será mais usado)
  isAudioOnly?: boolean;   // NOVO: mensagem é apenas áudio
  isFirstInSequence?: boolean;
}
```

**2. Modificar array de mensagens (linhas 93-98)**

Separar a última mensagem em duas:

```typescript
// Antes (mensagem única com texto + áudio junto)
{
  sender: "aura",
  content: "Isso é uma pista enorme 💡",
  time: "21:34",
  hasAudio: true,
}

// Depois (duas mensagens separadas)
{
  sender: "aura",
  content: "Isso é uma pista enorme 💡",
},
{
  sender: "aura",
  content: "",           // sem texto
  time: "21:34",
  isAudioOnly: true,     // apenas áudio
}
```

**3. Atualizar renderização (linhas 407-431)**

Criar lógica condicional para renderizar:
- Se `isAudioOnly`: renderiza apenas o `WhatsAppVoiceMessage` (sem balão de texto)
- Senão: renderiza o balão de texto normal

```typescript
{messages.slice(0, visibleMessages).map((message, index) => {
  // ... código existente ...
  
  return (
    <div key={index} className={...}>
      {message.isAudioOnly ? (
        // Renderiza apenas o player de áudio como balão próprio
        <div className="bg-card border border-border/50 rounded-2xl rounded-bl-md px-3 py-2 max-w-[85%]">
          <WhatsAppVoiceMessage 
            isPlaying={isAudioPlaying} 
            onToggle={handleAudioToggle}
            duration="0:04"
            currentTime={0}
            totalDuration={4}
          />
          {message.time && (
            <p className="text-[10px] mt-1 text-muted-foreground text-right">
              {message.time}
            </p>
          )}
        </div>
      ) : (
        // Renderiza balão de texto normal (código atual)
        <div className={...}>
          <p>{message.content}</p>
          {/* ... resto do código ... */}
        </div>
      )}
    </div>
  );
})}
```

**4. Remover código antigo**

Remover o bloco que renderizava `WhatsAppVoiceMessage` dentro do balão de texto (linhas 421-430).

## Resultado Visual

```text
┌─────────────────────────────┐
│ Isso é uma pista enorme 💡  │  ← Balão de texto
└─────────────────────────────┘
                               
┌─────────────────────────────┐
│ ▶ ▁▂▃▄▅▃▂▁▄▅▆▄▃▂  0:04  🔵 │  ← Balão de áudio separado
│                       21:34 │
└─────────────────────────────┘
```

Exatamente como aparece no WhatsApp quando alguém envia um texto e depois um áudio.
