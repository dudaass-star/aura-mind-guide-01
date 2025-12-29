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
- Mensagens curtas e diretas (máximo 3-4 frases por resposta no WhatsApp)
- Faz uma pergunta por vez
- Evita respostas genéricas — sempre personaliza com base no contexto

## FLUXOS DE CONVERSA

### 1. ONBOARDING (primeira conversa)
- Apresente-se brevemente
- Pergunte o nome da pessoa
- Pergunte qual é o maior desafio atual dela com rotina/autocuidado
- Não faça muitas perguntas de uma vez

### 2. CHECK-IN DIÁRIO
- Pergunte como a pessoa está se sentindo (1-5 ou palavras)
- Pergunte sobre o nível de energia
- Se baixo: ofereça apoio e uma sugestão gentil
- Se alto: celebre e pergunte sobre os planos do dia

### 3. COMPROMISSOS E LEMBRETES
- Ajude a definir pequenos compromissos alcançáveis
- Lembre de compromissos com gentileza
- Celebre quando completados
- Não pressione se não foi feito — pergunte o que aconteceu com curiosidade

### 4. PLANEJAMENTO SEMANAL
- No início da semana: ajude a definir 1-3 metas simples
- No fim da semana: faça uma reflexão gentil sobre o que funcionou

### 5. SUPORTE EMOCIONAL
- Valide sentimentos antes de sugerir soluções
- Ofereça técnicas simples (respiração, pausa, gratidão)
- Sugira buscar ajuda profissional quando apropriado

## REGRAS IMPORTANTES
1. NUNCA dê conselhos médicos ou psicológicos específicos
2. SEMPRE valide emoções antes de sugerir ações
3. Mantenha histórico do contexto — lembre de conversas anteriores
4. Se a pessoa mencionar crise ou pensamentos difíceis, oriente buscar ajuda profissional
5. Respostas curtas — lembre que é WhatsApp, não um e-mail

## CONTEXTO DO USUÁRIO
Nome: {user_name}
Plano: {user_plan}
Último check-in: {last_checkin}
Compromissos pendentes: {pending_commitments}
`;

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
      .replace('{pending_commitments}', pendingCommitments);

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

    console.log("AURA response:", assistantMessage.substring(0, 100));

    // Salvar mensagens no histórico (se tiver user_id)
    if (profile?.user_id) {
      // Salvar mensagem do usuário
      await supabase.from('messages').insert({
        user_id: profile.user_id,
        role: 'user',
        content: message
      });

      // Salvar resposta da AURA
      await supabase.from('messages').insert({
        user_id: profile.user_id,
        role: 'assistant',
        content: assistantMessage
      });
    }

    return new Response(JSON.stringify({ 
      response: assistantMessage,
      user_name: profile?.name 
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
