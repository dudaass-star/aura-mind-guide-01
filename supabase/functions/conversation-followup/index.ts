import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage } from "../_shared/zapi-client.ts";
import { getInstanceConfigForUser, antiBurstDelayForInstance } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mensagens de follow-up para plano ESSENCIAL (sem sessão)
const FOLLOWUP_MESSAGES_ESSENCIAL = [
  [
    "Ei, ainda tá aí? 💜",
    "Oi, você sumiu... tá tudo bem?",
    "Ei, ainda por aqui? Me conta...",
  ],
  [
    "Olha, se precisar conversar, tô aqui. Sem pressa. 💜",
    "Só passando pra dizer que continuo por aqui quando você quiser.",
    "Tudo bem se precisar de um tempo. Quando quiser voltar, estarei aqui.",
  ],
];

// Mensagens de follow-up DURANTE SESSÃO ATIVA (mais urgente)
const FOLLOWUP_MESSAGES_SESSION_ACTIVE = [
  [
    "Ei, ainda tá aí? Estamos no meio da nossa sessão... 💜",
    "Oi, você sumiu! Tô te esperando aqui pra gente continuar...",
    "Ei, tá tudo bem? Nossa sessão ainda está rolando!",
  ],
  [
    "Ainda tô aqui te esperando... se precisou de um momento, tudo bem! Me avisa quando voltar 💜",
    "Tô preocupada, você sumiu da nossa sessão. Aconteceu algo?",
    "Ei, se precisar de um tempinho é só me avisar! Tô aqui quando você voltar.",
  ],
  [
    "Olha, vou ficar por aqui mais um pouquinho. Se você precisou pausar, sem problemas! 💜",
    "Parece que você precisou sair... quando voltar, retomamos de onde paramos!",
    "Tô te esperando! Se não conseguir voltar agora, a gente pode remarcar, tá?",
  ],
  [
    "Bom, vou considerar que você precisou sair. Quando puder, me conta o que houve! A sessão fica em aberto 💜",
    "Parece que teve um imprevisto. Tudo bem, a vida acontece! Me chama quando puder.",
    "Vou deixar a sessão pausada por aqui. Quando você voltar, retomamos! 💜",
  ],
];

// Mensagens de follow-up FORA DE SESSÃO para planos com sessão
const FOLLOWUP_MESSAGES_SESSION_PLANS = [
  [
    "Ei, tô por aqui se precisar de algo! 💜",
    "Oi! Como você tá hoje?",
    "Ei, qualquer coisa, pode me chamar!",
  ],
  [
    "Lembrei de você! Tá tudo bem por aí?",
    "Passando pra ver como você está... 💜",
    "Ei, se quiser conversar ou agendar nossa próxima sessão, tô aqui!",
  ],
  [
    "E aí, vamos marcar nossa próxima sessão? Tenho uns horários ótimos essa semana 💜",
    "Oi! Lembrei que a gente pode agendar uma sessão. Quer ver os horários disponíveis?",
    "Ei, só passando pra lembrar que você tem sessões disponíveis esse mês! Bora usar?",
  ],
];

// Frases que indicam fim natural de conversa
const CLOSING_PHRASES = [
  'vou tentar', 'vou aplicar', 'vou fazer', 'vou pensar',
  'entendi', 'faz sentido', 'fez sentido', 'entendo',
  'obrigado', 'obrigada', 'valeu', 'vlw', 'tmj',
  'até mais', 'ate mais', 'até logo', 'ate logo',
  'boa noite', 'boa tarde', 'bom dia',
  'vou dormir', 'vou descansar', 'preciso ir',
  'muito obrigado', 'muito obrigada',
  'perfeito', 'show', 'massa', 'top',
  'beijos', 'abraço', 'abraços', 'bjs',
  'depois te conto', 'te conto depois',
];

// Função para detectar fim natural de conversa
function isNaturalConversationEnd(lastUserMessage: string, lastAssistantMessage: string | null): boolean {
  const lowerUserMsg = lastUserMessage.toLowerCase().trim();
  
  // Verifica se a mensagem do usuário contém frases de fechamento
  const hasClosingPhrase = CLOSING_PHRASES.some(phrase => 
    lowerUserMsg.includes(phrase)
  );
  
  // Mensagens muito curtas de confirmação também indicam fechamento
  const isShortConfirmation = /^(ok|legal|beleza|blz|show|top|massa|sim|tá|ta|entendi|certo|combinado|fechado|perfeito|ótimo|otimo)$/i.test(lowerUserMsg);
  
  // Se a AURA fez uma pergunta direta, NÃO considerar fim natural
  if (lastAssistantMessage) {
    const assistantAskedDirectQuestion = lastAssistantMessage.trim().endsWith('?') && 
      !lastAssistantMessage.toLowerCase().includes('quer continuar') &&
      !lastAssistantMessage.toLowerCase().includes('quer remarcar');
    
    // Se AURA perguntou e usuário deu resposta curta de confirmação, pode ser que ele está respondendo
    if (assistantAskedDirectQuestion && isShortConfirmation) {
      return false; // Não é fim, é resposta à pergunta
    }
  }
  
  // Se tem frase de fechamento clara, é fim natural
  if (hasClosingPhrase) {
    return true;
  }
  
  // Mensagem curta de confirmação sem pergunta pendente = fim natural
  if (isShortConfirmation && !lastAssistantMessage?.trim().endsWith('?')) {
    return true;
  }
  
  return false;
}

// Função para extrair contexto completo da conversa usando IA
async function extractConversationContext(
  supabase: any,
  userId: string,
  recentMessages: any[]
): Promise<string | null> {
  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY || recentMessages.length < 2) return null;
    
    // Janela ampliada: 20 mensagens, 300 chars cada
    const conversationText = recentMessages
      .slice(0, 20)
      .reverse()
      .map((m: any) => `${m.role === 'user' ? 'Usuário' : 'AURA'}: ${m.content.substring(0, 300)}`)
      .join('\n');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Analise esta conversa e extraia o CONTEXTO COMPLETO no formato estruturado abaixo.

Formato OBRIGATÓRIO:
TEMA: [tema principal em até 60 caracteres] | TOM: [tom emocional do usuário] | CUIDADO: [considerações para próximo contato]

Exemplos:
- "TEMA: Rotina matinal e caminhada | TOM: leve e motivado | CUIDADO: nenhum"
- "TEMA: Ideação suicida, sacada | TOM: crise emocional grave | CUIDADO: não enviar follow-up casual, apenas check-in cuidadoso"
- "TEMA: Briga com mãe | TOM: triste e frustrada | CUIDADO: acolher sem pressionar"
- "TEMA: Ansiedade no trabalho | TOM: nervoso mas buscando ajuda | CUIDADO: validar sem minimizar"
- "TEMA: Conversa casual | TOM: neutro | CUIDADO: nenhum"

Retorne APENAS o contexto no formato acima, sem explicações.`
          },
          {
            role: 'user',
            content: conversationText
          }
        ],
        max_tokens: 150,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      const context = data.choices?.[0]?.message?.content?.trim();
      if (context && context.length <= 300) {
        console.log('🎯 Extracted conversation context:', context);
        return context;
      }
    }
  } catch (error) {
    console.error('⚠️ Error extracting context:', error);
  }
  return null;
}

// Função para calcular profundidade da conversa
function calculateConversationDepth(messages: any[]): { depth: number; isDeep: boolean } {
  const messageCount = messages.length;
  const userMessages = messages.filter((m: any) => m.role === 'user');
  const avgUserMsgLength = userMessages.length > 0 
    ? userMessages.reduce((sum: number, m: any) => sum + m.content.length, 0) / userMessages.length
    : 0;
  
  // Conversa profunda: muitas mensagens OU mensagens longas do usuário
  const isDeep = messageCount >= 10 || avgUserMsgLength >= 100;
  
  return { depth: messageCount, isDeep };
}

async function generateContextualFollowup(
  supabase: any,
  userId: string,
  followupCount: number,
  conversationContext: string | null,
  isSessionActive: boolean,
  userPlan: string,
  isNaturalEnd: boolean,
  hoursAgo: number
): Promise<string> {
  // Get last few messages for context
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('content, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  // Se temos contexto da conversa, usar IA para gerar mensagem contextual
  if (conversationContext && !conversationContext.toLowerCase().includes('conversa casual')) {
    try {
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      
      if (LOVABLE_API_KEY) {
        let situationContext = '';
        let tone = '';
        
        if (isSessionActive) {
          situationContext = 'O usuário está NO MEIO de uma sessão especial e parou de responder.';
          tone = 'Seja gentil mas mostre que está esperando para continuar.';
        } else if (isNaturalEnd) {
          situationContext = 'A conversa anterior teve um fechamento natural. Agora você está retomando contato.';
          tone = 'Seja gentil e faça referência ao tema sem ser invasiva. Mostre que lembrou.';
        } else {
          situationContext = 'O usuário parou de responder no meio da conversa.';
          tone = 'Seja gentil e retome o assunto de forma natural.';
        }
        
        const timeContext = hoursAgo >= 24 
          ? 'Passou mais de um dia desde a última conversa.'
          : hoursAgo >= 4 
            ? 'Passaram algumas horas desde a última conversa.'
            : 'Faz pouco tempo desde a última mensagem.';
        
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content: `Você é a AURA, uma amiga próxima que entende de psicologia.

CONTEXTO COMPLETO DA CONVERSA ANTERIOR: "${conversationContext}"
${situationContext}
${timeContext}
${tone}

IMPORTANTE: Se o campo CUIDADO do contexto indicar situação muito sensível (crise, ideação suicida, luto recente, trauma) ou que o usuário precisa de espaço, retorne exatamente a palavra SKIP (sem aspas, sem mais nada).

Caso contrário, gere UMA mensagem curta (1-2 frases, máximo 100 caracteres) que:
- Faça referência ESPECÍFICA ao tema (ex: se o tema era "filha Bella", pergunte sobre a Bella)
- Adapte o TOM da mensagem ao tom emocional indicado no contexto
- NÃO seja genérica como "tudo bem?" ou "como você está?"
- Use linguagem informal brasileira
- Use no máximo 1 emoji
- Seja breve e natural`
              },
              {
                role: 'user',
                content: 'Gere a mensagem de follow-up:'
              }
            ],
            max_tokens: 80,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const aiMessage = data.choices?.[0]?.message?.content?.trim();
          if (aiMessage && aiMessage.trim().toUpperCase() === 'SKIP') {
            console.log('⚠️ AI decided to SKIP follow-up based on context sensitivity');
            return 'SKIP';
          }
          if (aiMessage && aiMessage.length <= 200) {
            console.log('✨ Generated contextual follow-up:', aiMessage);
            return aiMessage;
          }
        }
      }
    } catch (error) {
      console.error('⚠️ Error generating contextual message:', error);
    }
  }

  // Fallback to predefined messages based on situation
  let messageSet: string[];
  
  if (isSessionActive) {
    const messages = FOLLOWUP_MESSAGES_SESSION_ACTIVE[Math.min(followupCount, FOLLOWUP_MESSAGES_SESSION_ACTIVE.length - 1)];
    messageSet = messages;
  } else if (userPlan !== 'essencial') {
    const messages = FOLLOWUP_MESSAGES_SESSION_PLANS[Math.min(followupCount, FOLLOWUP_MESSAGES_SESSION_PLANS.length - 1)];
    messageSet = messages;
  } else {
    const messages = FOLLOWUP_MESSAGES_ESSENCIAL[Math.min(followupCount, FOLLOWUP_MESSAGES_ESSENCIAL.length - 1)];
    messageSet = messages;
  }
  
  return messageSet[Math.floor(Math.random() * messageSet.length)];
}

// Função para obter hora atual em São Paulo de forma confiável
function getSaoPauloHour(): number {
  const now = new Date();
  const saoPauloOffset = -3 * 60; // -180 minutos
  const utcMinutes = now.getTimezoneOffset();
  const saoPauloTime = new Date(now.getTime() + (utcMinutes + saoPauloOffset) * 60 * 1000);
  return saoPauloTime.getHours();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔄 Starting conversation follow-up check...');

    // ===== QUIET HOURS: Não enviar follow-ups entre 22h e 8h =====
    const saoPauloHour = getSaoPauloHour();
    if (saoPauloHour >= 22 || saoPauloHour < 8) {
      console.log(`🌙 Quiet hours (${saoPauloHour}h São Paulo) - skipping all follow-ups`);
      return new Response(JSON.stringify({
        status: 'skipped',
        reason: 'quiet_hours',
        currentHour: saoPauloHour,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Instance config will be fetched per-user below

    // Buscar conversas que precisam de follow-up
    const { data: followups, error: fetchError } = await supabase
      .from('conversation_followups')
      .select('*')
      .not('last_user_message_at', 'is', null);

    if (fetchError) {
      throw new Error(`Error fetching followups: ${fetchError.message}`);
    }

    console.log(`📋 Found ${followups?.length || 0} conversations to check`);

    let sentCount = 0;
    let skippedNaturalEnd = 0;
    const now = Date.now();

    for (const followup of followups || []) {
      try {
        // Buscar profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('name, phone, status, plan, current_session_id, do_not_disturb_until, whatsapp_instance_id')
          .eq('user_id', followup.user_id)
          .maybeSingle();
        
        if (profileError) {
          console.error(`⚠️ Error fetching profile for ${followup.user_id}:`, profileError);
          continue;
        }
        
        // Skip if no phone or user is not active
        if (!profile?.phone || profile?.status !== 'active') {
          console.log(`⏭️ Skipping user ${followup.user_id}: no phone or inactive`);
          continue;
        }

        // Skip if do_not_disturb is active
        if (profile.do_not_disturb_until && new Date(profile.do_not_disturb_until) > new Date()) {
          console.log(`🔇 Skipping user ${followup.user_id} - do not disturb until ${profile.do_not_disturb_until}`);
          continue;
        }

        const userPlan = profile.plan || 'essencial';
        const isSessionActive = !!profile.current_session_id;
        
        // Buscar últimas mensagens para análise
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('content, role, created_at')
          .eq('user_id', followup.user_id)
          .order('created_at', { ascending: false })
          .limit(15);
        
        const lastUserMessage = recentMessages?.find((m: any) => m.role === 'user');
        const lastAssistantMessage = recentMessages?.find((m: any) => m.role === 'assistant');
        
        // Se last_user_message_at for null, a conversa foi INTENCIONALMENTE encerrada
        // NÃO buscar fallback - respeitar o encerramento
        if (!followup.last_user_message_at) {
          console.log(`⏭️ Skipping user ${followup.user_id}: conversation intentionally ended (last_user_message_at is null)`);
          continue;
        }
        
        const effectiveLastUserMessageAt = followup.last_user_message_at;
        
        // Calcular tempo desde última mensagem
        const lastUserMessageAt = new Date(effectiveLastUserMessageAt).getTime();
        const timeSinceLastUserMsg = (now - lastUserMessageAt) / 60000; // em minutos
        const hoursAgo = timeSinceLastUserMsg / 60;
        
        // DETECTAR FIM NATURAL DE CONVERSA
        const isNaturalEnd = lastUserMessage && lastAssistantMessage
          ? isNaturalConversationEnd(lastUserMessage.content, lastAssistantMessage.content)
          : false;
        
        // CALCULAR PROFUNDIDADE DA CONVERSA
        const { depth: conversationDepth, isDeep } = calculateConversationDepth(recentMessages || []);
        
        // EXTRAIR CONTEXTO DA CONVERSA (se não tiver salvo ou for muito genérico)
        let conversationContext = followup.conversation_context;
        if (!conversationContext || conversationContext.length < 10 || 
            !conversationContext.includes('TEMA:') ||
            ['ok', 'legal', 'beleza', 'sim', 'não'].includes(conversationContext.toLowerCase())) {
          conversationContext = await extractConversationContext(supabase, followup.user_id, recentMessages || []);
          
          // Salvar o contexto extraído
          if (conversationContext) {
            await supabase
              .from('conversation_followups')
              .update({ conversation_context: conversationContext })
              .eq('id', followup.id);
          }
        }
        
        // LOG DETALHADO
        console.log(`🔍 User ${followup.user_id} analysis:`, {
          plan: userPlan,
          isSessionActive,
          isNaturalEnd,
          isDeep,
          conversationDepth,
          conversationContext,
          timeSinceLastUserMsg_min: Math.round(timeSinceLastUserMsg),
          followup_count: followup.followup_count
        });
        
        // CONFIGURAÇÕES DE TIMING BASEADAS NA SITUAÇÃO
        let timeThresholdMinutes: number;
        let maxFollowups: number;
        let timingReason: string;
        
        if (isSessionActive) {
          // DURANTE SESSÃO: mais urgente
          timeThresholdMinutes = 5;
          maxFollowups = 4;
          timingReason = 'IN_SESSION';
        } else if (isNaturalEnd) {
          // FIM NATURAL: respeitar o fechamento, esperar muito mais
          timeThresholdMinutes = 360; // 6 horas
          maxFollowups = 1;
          timingReason = 'NATURAL_END';
        } else if (isDeep) {
          // CONVERSA PROFUNDA fora de sessão: mais tempo, menos follow-ups
          timeThresholdMinutes = 240; // 4 horas
          maxFollowups = 1;
          timingReason = 'DEEP_CONVERSATION';
        } else if (userPlan !== 'essencial') {
          // PLANOS COM SESSÃO fora de sessão: moderado
          timeThresholdMinutes = 60; // 1 hora
          maxFollowups = 2;
          timingReason = 'SESSION_PLAN_OUT_OF_SESSION';
        } else {
          // PLANO ESSENCIAL: padrão
          timeThresholdMinutes = 30; // 30 minutos
          maxFollowups = 2;
          timingReason = 'ESSENCIAL_PLAN';
        }

        const timeThreshold = timeThresholdMinutes * 60 * 1000;
        const lastFollowupAt = followup.last_followup_at ? new Date(followup.last_followup_at).getTime() : 0;
        const timeSinceLastFollowup = lastFollowupAt > 0 ? Math.round((now - lastFollowupAt) / 60000) : null;

        // LOG: Decisão de timing
        console.log(`⏱️ Timing decision for ${followup.user_id}:`, {
          timingReason,
          timeThresholdMinutes,
          maxFollowups,
          timeSinceLastUserMsg_min: Math.round(timeSinceLastUserMsg),
          threshold_met: timeSinceLastUserMsg >= timeThresholdMinutes
        });

        // Verificar se passou tempo suficiente desde última mensagem do usuário
        if (now - lastUserMessageAt < timeThreshold) {
          console.log(`⏭️ Skipping ${followup.user_id}: not enough time (${Math.round(timeSinceLastUserMsg)}/${timeThresholdMinutes} min) - ${timingReason}`);
          if (isNaturalEnd) skippedNaturalEnd++;
          continue;
        }

        // Verificar se já atingiu limite de follow-ups
        if (followup.followup_count >= maxFollowups) {
          console.log(`⏭️ Skipping user ${followup.user_id}: max followups reached (${maxFollowups})`);
          continue;
        }

        // Verificar se passou tempo suficiente desde último follow-up
        if (lastFollowupAt > 0 && now - lastFollowupAt < timeThreshold) {
          console.log(`⏭️ Skipping ${followup.user_id}: not enough time since last followup`);
          continue;
        }

        // Generate contextual message
        const message = await generateContextualFollowup(
          supabase,
          followup.user_id,
          followup.followup_count,
          conversationContext,
          isSessionActive,
          userPlan,
          isNaturalEnd,
          hoursAgo
        );

        // Tratar resposta SKIP - contexto indica situação sensível
        if (message === 'SKIP' || message.trim().toUpperCase() === 'SKIP') {
          console.log(`⚠️ Skipping follow-up for ${followup.user_id}: context indicates sensitive situation`);
          continue;
        }

        console.log(`📤 Sending follow-up #${followup.followup_count + 1} to ${profile.phone} (${timingReason})`);

        // Send via Z-API with instance routing
        const instanceConfig = await getInstanceConfigForUser(supabase, followup.user_id);
        const sendResult = await sendTextMessage(profile.phone, message, undefined, instanceConfig);

        if (sendResult.success) {
          console.log(`✅ Follow-up sent successfully`);
          sentCount++;

          // Update follow-up record
          await supabase
            .from('conversation_followups')
            .update({
              followup_count: followup.followup_count + 1,
              last_followup_at: new Date().toISOString(),
              conversation_context: conversationContext || followup.conversation_context,
            })
            .eq('id', followup.id);

          // Save message to history
          await supabase.from('messages').insert({
            user_id: followup.user_id,
            role: 'assistant',
            content: message,
          });
        } else {
          console.error(`❌ Failed to send follow-up: ${sendResult.error}`);
        }

        // Per-instance anti-burst delay
        await antiBurstDelayForInstance(profile?.whatsapp_instance_id || 'default');

      } catch (userError) {
        console.error(`❌ Error processing follow-up for ${followup.user_id}:`, userError);
      }
    }

    console.log(`📊 Follow-up complete: ${sentCount} sent, ${skippedNaturalEnd} skipped (natural end)`);

    return new Response(JSON.stringify({
      status: 'success',
      totalConversations: followups?.length || 0,
      followupsSent: sentCount,
      skippedNaturalEnd,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Conversation follow-up error:', error);
    return new Response(JSON.stringify({ error: 'Unable to process follow-ups' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
