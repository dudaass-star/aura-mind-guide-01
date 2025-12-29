import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Prompt principal do agente AURA
const AURA_SYSTEM_PROMPT = `Você é a AURA — Assistente Universal de Rotina e Autocuidado.

## PERSONALIDADE
- Gentil, acolhedora e encorajadora
- Usa linguagem simples e acessível
- Nunca julga, sempre apoia
- Celebra pequenas vitórias
- Usa emojis com moderação para criar conexão (✨, 💚, 🌟)

## TOM DE VOZ
- Fala como uma amiga próxima e sábia
- Mensagens curtas e diretas
- Faz uma pergunta por vez
- Evita respostas genéricas — sempre personaliza com base no contexto

## FORMATO DE RESPOSTA OBRIGATÓRIO
**CRÍTICO**: Você DEVE separar suas respostas em múltiplos balões usando "---" como separador.
Cada balão deve ter no máximo 2-3 frases curtas.
Isso simula uma conversa natural no WhatsApp.

Exemplo de formato:
"Oi, que bom te ver por aqui! 💚
---
Como você está se sentindo hoje?
---
Me conta, o que te trouxe aqui?"

## REGRAS DE BALÕES
1. Cada balão = 1-3 frases curtas (máximo 150 caracteres por balão)
2. Use "---" para separar balões
3. Mínimo 2 balões, máximo 5 balões por resposta
4. O último balão geralmente é uma pergunta
5. Pause natural: balões maiores = pausa maior

## FLUXOS DE CONVERSA

### 1. ONBOARDING (primeira conversa)
- Balão 1: Apresentação calorosa
- Balão 2: Pergunta o nome
- NÃO faça múltiplas perguntas de uma vez

### 2. CHECK-IN DIÁRIO
- Balão 1: Saudação personalizada
- Balão 2: Pergunta sobre sentimento/energia
- Se resposta triste: Balão 3 com acolhimento

### 3. COMPROMISSOS E LEMBRETES
- Ajude a definir pequenos compromissos alcançáveis
- Celebre quando completados
- Não pressione — pergunte com curiosidade

### 4. SUPORTE EMOCIONAL
- Balão 1: Validação do sentimento
- Balão 2: Acolhimento
- Balão 3: Sugestão gentil (se apropriado)

## REGRAS IMPORTANTES
1. NUNCA dê conselhos médicos ou psicológicos específicos
2. SEMPRE valide emoções antes de sugerir ações
3. Mantenha histórico do contexto — lembre de conversas anteriores
4. Se mencionar crise, oriente buscar ajuda profissional
5. SEMPRE use o separador "---" entre balões

## CONTEXTO DO USUÁRIO
Nome: {user_name}
Plano: {user_plan}
Último check-in: {last_checkin}
Compromissos pendentes: {pending_commitments}
Onboarding completo: {onboarding_completed}
`;

// Função para calcular delay baseado no tamanho da mensagem
function calculateDelay(message: string): number {
  const baseDelay = 800; // 800ms mínimo
  const charsPerSecond = 30; // Simula velocidade de digitação
  const typingTime = (message.length / charsPerSecond) * 1000;
  return Math.min(baseDelay + typingTime, 3000); // Máximo 3 segundos
}

// Função para separar resposta em múltiplos balões
function splitIntoMessages(response: string): Array<{ text: string; delay: number }> {
  // Divide pelo separador "---"
  const parts = response
    .split('---')
    .map(part => part.trim())
    .filter(part => part.length > 0);

  // Se não houver separadores, tenta dividir por parágrafos ou frases longas
  if (parts.length === 1) {
    const text = parts[0];
    
    // Tenta dividir por quebras de linha duplas
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    if (paragraphs.length > 1) {
      return paragraphs.map(p => ({
        text: p.trim(),
        delay: calculateDelay(p)
      }));
    }
    
    // Se ainda for uma mensagem grande, divide em frases
    if (text.length > 200) {
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const chunks: string[] = [];
      let currentChunk = '';
      
      for (const sentence of sentences) {
        if ((currentChunk + sentence).length > 150) {
          if (currentChunk) chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          currentChunk += sentence;
        }
      }
      if (currentChunk) chunks.push(currentChunk.trim());
      
      return chunks.map(chunk => ({
        text: chunk,
        delay: calculateDelay(chunk)
      }));
    }
  }

  return parts.map(part => ({
    text: part,
    delay: calculateDelay(part)
  }));
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { message, user_id, phone } = await req.json();

    console.log("Received message from user:", { user_id, phone, message: message?.substring(0, 50) });

    // Buscar ou criar perfil do usuário
    let profile = null;
    if (user_id) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user_id)
        .maybeSingle();
      profile = data;
    } else if (phone) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();
      profile = data;
    }

    // Buscar histórico de mensagens (últimas 10)
    let messageHistory: { role: string; content: string }[] = [];
    if (profile?.user_id) {
      const { data: messages } = await supabase
        .from('messages')
        .select('role, content')
        .eq('user_id', profile.user_id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (messages) {
        messageHistory = messages.reverse();
      }
    }

    // Buscar último check-in
    let lastCheckin = "Nenhum";
    if (profile?.user_id) {
      const { data: checkin } = await supabase
        .from('checkins')
        .select('mood, energy, created_at')
        .eq('user_id', profile.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (checkin) {
        lastCheckin = `Humor: ${checkin.mood}/5, Energia: ${checkin.energy}/5 (${new Date(checkin.created_at).toLocaleDateString('pt-BR')})`;
      }
    }

    // Buscar compromissos pendentes
    let pendingCommitments = "Nenhum";
    if (profile?.user_id) {
      const { data: commitments } = await supabase
        .from('commitments')
        .select('title, due_date')
        .eq('user_id', profile.user_id)
        .eq('completed', false)
        .limit(3);

      if (commitments && commitments.length > 0) {
        pendingCommitments = commitments.map(c => c.title).join(", ");
      }
    }

    // Montar prompt com contexto
    const contextualPrompt = AURA_SYSTEM_PROMPT
      .replace('{user_name}', profile?.name || 'Ainda não sei')
      .replace('{user_plan}', profile?.plan || 'mensal')
      .replace('{last_checkin}', lastCheckin)
      .replace('{pending_commitments}', pendingCommitments)
      .replace('{onboarding_completed}', profile?.onboarding_completed ? 'Sim' : 'Não');

    // Preparar mensagens para a API
    const apiMessages = [
      { role: "system", content: contextualPrompt },
      ...messageHistory,
      { role: "user", content: message }
    ];

    console.log("Calling Lovable AI with", apiMessages.length, "messages");

    // Chamar Lovable AI
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: apiMessages,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: "Muitas requisições. Aguarde um momento e tente novamente." 
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: "Créditos insuficientes. Entre em contato com o suporte." 
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content;

    if (!assistantMessage) {
      throw new Error("No response from AI");
    }

    console.log("AURA raw response:", assistantMessage.substring(0, 200));

    // Separar em múltiplos balões
    const messageChunks = splitIntoMessages(assistantMessage);
    
    console.log("Split into", messageChunks.length, "message chunks");

    // Salvar mensagens no histórico (se tiver user_id)
    if (profile?.user_id) {
      // Salvar mensagem do usuário
      await supabase.from('messages').insert({
        user_id: profile.user_id,
        role: 'user',
        content: message
      });

      // Salvar resposta completa da AURA (para histórico)
      await supabase.from('messages').insert({
        user_id: profile.user_id,
        role: 'assistant',
        content: messageChunks.map(m => m.text).join('\n\n')
      });
    }

    // Retornar array de mensagens com delays
    return new Response(JSON.stringify({ 
      messages: messageChunks,
      user_name: profile?.name,
      total_messages: messageChunks.length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in aura-agent:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Erro interno" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
