import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mensagens de follow-up para plano ESSENCIAL (sem sessão)
const FOLLOWUP_MESSAGES_ESSENCIAL = [
  // Primeiro follow-up (após 15 min)
  [
    "Ei, ainda tá aí? 💜",
    "Oi, você sumiu... tá tudo bem?",
    "Ei, ainda por aqui? Me conta...",
  ],
  // Segundo follow-up (após mais 15 min)
  [
    "Olha, se precisar conversar, tô aqui. Sem pressa. 💜",
    "Só passando pra dizer que continuo por aqui quando você quiser.",
    "Tudo bem se precisar de um tempo. Quando quiser voltar, estarei aqui.",
  ],
];

// Mensagens de follow-up DURANTE SESSÃO ATIVA (mais urgente)
const FOLLOWUP_MESSAGES_SESSION_ACTIVE = [
  // Primeiro follow-up (após 5 min)
  [
    "Ei, ainda tá aí? Estamos no meio da nossa sessão... 💜",
    "Oi, você sumiu! Tô te esperando aqui pra gente continuar...",
    "Ei, tá tudo bem? Nossa sessão ainda está rolando!",
  ],
  // Segundo follow-up (após mais 5 min)
  [
    "Ainda tô aqui te esperando... se precisou de um momento, tudo bem! Me avisa quando voltar 💜",
    "Tô preocupada, você sumiu da nossa sessão. Aconteceu algo?",
    "Ei, se precisar de um tempinho é só me avisar! Tô aqui quando você voltar.",
  ],
  // Terceiro follow-up (após mais 5 min)
  [
    "Olha, vou ficar por aqui mais um pouquinho. Se você precisou pausar, sem problemas! 💜",
    "Parece que você precisou sair... quando voltar, retomamos de onde paramos!",
    "Tô te esperando! Se não conseguir voltar agora, a gente pode remarcar, tá?",
  ],
  // Quarto follow-up (após mais 5 min)
  [
    "Bom, vou considerar que você precisou sair. Quando puder, me conta o que houve! A sessão fica em aberto 💜",
    "Parece que teve um imprevisto. Tudo bem, a vida acontece! Me chama quando puder.",
    "Vou deixar a sessão pausada por aqui. Quando você voltar, retomamos! 💜",
  ],
];

// Mensagens de follow-up FORA DE SESSÃO para planos com sessão (puxar engajamento)
const FOLLOWUP_MESSAGES_SESSION_PLANS = [
  // Primeiro follow-up (após 30 min)
  [
    "Ei, tô por aqui se precisar de algo! 💜",
    "Oi! Como você tá hoje?",
    "Ei, qualquer coisa, pode me chamar!",
  ],
  // Segundo follow-up (após mais 30 min)
  [
    "Lembrei de você! Tá tudo bem por aí?",
    "Passando pra ver como você está... 💜",
    "Ei, se quiser conversar ou agendar nossa próxima sessão, tô aqui!",
  ],
  // Terceiro follow-up (após mais 30 min)
  [
    "E aí, vamos marcar nossa próxima sessão? Tenho uns horários ótimos essa semana 💜",
    "Oi! Lembrei que a gente pode agendar uma sessão. Quer ver os horários disponíveis?",
    "Ei, só passando pra lembrar que você tem sessões disponíveis esse mês! Bora usar?",
  ],
];

async function generateContextualFollowup(
  supabase: any,
  userId: string,
  followupCount: number,
  lastContext: string | null,
  isSessionActive: boolean,
  userPlan: string
): Promise<string> {
  // Get last few messages for context
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('content, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  // If we have context, use AI to generate contextual message
  if (recentMessages && recentMessages.length > 0) {
    const lastUserMessage = recentMessages.find((m: any) => m.role === 'user');
    const lastAssistantMessage = recentMessages.find((m: any) => m.role === 'assistant');

    if (lastUserMessage || lastAssistantMessage) {
      try {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        
        if (LOVABLE_API_KEY) {
          const context = lastUserMessage?.content || lastAssistantMessage?.content;
          
          // Contexto diferente baseado na situação
          let situationContext = '';
          let urgency = '';
          
          if (isSessionActive) {
            situationContext = 'O usuário está NO MEIO de uma sessão especial e parou de responder.';
            urgency = 'Seja gentil mas mostre que está esperando. A sessão está ativa!';
          } else if (userPlan !== 'essencial') {
            situationContext = 'O usuário tem um plano com sessões mas não está em sessão agora.';
            urgency = followupCount < 2 
              ? 'Seja gentil e mostre disponibilidade.' 
              : 'Incentive gentilmente a agendar uma sessão.';
          } else {
            situationContext = 'O usuário está no plano básico.';
            urgency = 'Seja gentil e deixe espaço.';
          }
          
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
                  content: `Você é a AURA, uma mentora emocional gentil. 
${situationContext}
${urgency}
Gere UMA mensagem curta (máximo 2 frases) para retomar contato.
Use linguagem informal brasileira. 
NÃO use emojis demais (máximo 1).
Faça referência sutil ao contexto da conversa.`
                },
                {
                  role: 'user',
                  content: `Contexto da última conversa: "${context?.substring(0, 200)}"\n\nGere a mensagem de follow-up:`
                }
              ],
              max_tokens: 100,
              temperature: 0.8,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const aiMessage = data.choices?.[0]?.message?.content?.trim();
            if (aiMessage) {
              console.log('✨ Generated contextual follow-up:', aiMessage);
              return aiMessage;
            }
          }
        }
      } catch (error) {
        console.error('⚠️ Error generating contextual message:', error);
      }
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔄 Starting conversation follow-up check...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID')!;
    const zapiToken = Deno.env.get('ZAPI_TOKEN')!;
    const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN')!;

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
    const now = Date.now();

    for (const followup of followups || []) {
      try {
        // Buscar profile separadamente (evita relação FK inexistente)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('name, phone, status, plan, current_session_id')
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

        const userPlan = profile.plan || 'essencial';
        const isSessionActive = !!profile.current_session_id;
        
        // FALLBACK: Se last_user_message_at for null mas há sessão ativa, buscar última mensagem
        let effectiveLastUserMessageAt = followup.last_user_message_at;
        if (!effectiveLastUserMessageAt && isSessionActive) {
          const { data: lastMsg } = await supabase
            .from('messages')
            .select('created_at')
            .eq('user_id', followup.user_id)
            .eq('role', 'user')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (lastMsg) {
            effectiveLastUserMessageAt = lastMsg.created_at;
            console.log(`🔄 Fallback: Using last message time for ${followup.user_id}: ${effectiveLastUserMessageAt}`);
          }
        }
        
        // Se ainda não temos timestamp, pular
        if (!effectiveLastUserMessageAt) {
          console.log(`⏭️ Skipping user ${followup.user_id}: no last_user_message_at available`);
          continue;
        }
        
        // LOG DETALHADO: Estado do usuário para decisão de timing
        console.log(`🔍 User ${followup.user_id} state:`, {
          plan: userPlan,
          current_session_id: profile.current_session_id,
          isSessionActive,
          followup_count: followup.followup_count,
          last_user_message_at: effectiveLastUserMessageAt,
          last_followup_at: followup.last_followup_at
        });
        
        // Configurações diferentes por situação
        let timeThresholdMinutes: number;
        let maxFollowups: number;
        let timingReason: string;
        
        if (isSessionActive) {
          // DURANTE SESSÃO: mais urgente
          timeThresholdMinutes = 5;  // 5 minutos
          maxFollowups = 4;           // Até 4 tentativas
          timingReason = 'IN_SESSION';
        } else if (userPlan !== 'essencial') {
          // PLANOS COM SESSÃO fora de sessão: moderado
          timeThresholdMinutes = 30; // 30 minutos
          maxFollowups = 3;          // Até 3 tentativas
          timingReason = 'SESSION_PLAN_OUT_OF_SESSION';
        } else {
          // PLANO ESSENCIAL: padrão
          timeThresholdMinutes = 15; // 15 minutos
          maxFollowups = 2;          // Até 2 tentativas
          timingReason = 'ESSENCIAL_PLAN';
        }

        const timeThreshold = timeThresholdMinutes * 60 * 1000;
        const lastUserMessageAt = new Date(effectiveLastUserMessageAt).getTime();
        const lastFollowupAt = followup.last_followup_at ? new Date(followup.last_followup_at).getTime() : 0;
        
        const timeSinceLastUserMsg = Math.round((now - lastUserMessageAt) / 60000);
        const timeSinceLastFollowup = lastFollowupAt > 0 ? Math.round((now - lastFollowupAt) / 60000) : null;

        // LOG: Decisão de timing
        console.log(`⏱️ Timing decision for ${followup.user_id}:`, {
          timingReason,
          timeThresholdMinutes,
          maxFollowups,
          timeSinceLastUserMsg_min: timeSinceLastUserMsg,
          timeSinceLastFollowup_min: timeSinceLastFollowup,
          threshold_met: timeSinceLastUserMsg >= timeThresholdMinutes
        });

        // Verificar se passou tempo suficiente desde última mensagem do usuário
        if (now - lastUserMessageAt < timeThreshold) {
          console.log(`⏭️ Skipping ${followup.user_id}: not enough time since last user msg (${timeSinceLastUserMsg}/${timeThresholdMinutes} min)`);
          continue;
        }

        // Verificar se já atingiu limite de follow-ups
        if (followup.followup_count >= maxFollowups) {
          console.log(`⏭️ Skipping user ${followup.user_id}: max followups reached (${maxFollowups})`);
          continue;
        }

        // Verificar se passou tempo suficiente desde último follow-up
        if (lastFollowupAt > 0 && now - lastFollowupAt < timeThreshold) {
          console.log(`⏭️ Skipping ${followup.user_id}: not enough time since last followup (${timeSinceLastFollowup}/${timeThresholdMinutes} min)`);
          continue;
        }

        // Generate contextual message
        const message = await generateContextualFollowup(
          supabase,
          followup.user_id,
          followup.followup_count,
          followup.conversation_context,
          isSessionActive,
          userPlan
        );

        console.log(`📤 Sending follow-up #${followup.followup_count + 1} to ${profile.phone} (plan: ${userPlan}, session: ${isSessionActive})`);

        // Send via Z-API
        const sendResponse = await fetch(
          `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-text`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Client-Token': zapiClientToken,
            },
            body: JSON.stringify({
              phone: profile.phone,
              message: message,
            }),
          }
        );

        if (sendResponse.ok) {
          console.log(`✅ Follow-up sent successfully`);
          sentCount++;

          // Update follow-up record
          await supabase
            .from('conversation_followups')
            .update({
              followup_count: followup.followup_count + 1,
              last_followup_at: new Date().toISOString(),
            })
            .eq('id', followup.id);

          // Save message to history
          await supabase.from('messages').insert({
            user_id: followup.user_id,
            role: 'assistant',
            content: message,
          });
        } else {
          const error = await sendResponse.text();
          console.error(`❌ Failed to send follow-up: ${error}`);
        }

        // Small delay between sends
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (userError) {
        console.error(`❌ Error processing follow-up for ${followup.user_id}:`, userError);
      }
    }

    console.log(`📊 Follow-up complete: ${sentCount} messages sent`);

    return new Response(JSON.stringify({
      status: 'success',
      totalConversations: followups?.length || 0,
      followupsSent: sentCount,
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
