import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendProactive } from "../_shared/whatsapp-provider.ts";
import { getInstanceConfigForUser, antiBurstDelayForInstance } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mensagens de follow-up (apenas 1 nível — máximo 1 follow-up)
const FOLLOWUP_MESSAGES_ESSENCIAL = [
  "Ei, ainda tá aí? 💜",
  "Oi, você sumiu... tá tudo bem?",
  "Ei, ainda por aqui? Me conta...",
];

const FOLLOWUP_MESSAGES_SESSION_ACTIVE = [
  "Ei, ainda tá aí? Estamos no meio da nossa sessão... 💜",
  "Oi, você sumiu! Tô te esperando aqui pra gente continuar...",
  "Ei, tá tudo bem? Nossa sessão ainda está rolando!",
];

const FOLLOWUP_MESSAGES_SESSION_PLANS = [
  "Ei, tô por aqui se precisar de algo! 💜",
  "Oi! Como você tá hoje?",
  "Ei, qualquer coisa, pode me chamar!",
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
  
  const hasClosingPhrase = CLOSING_PHRASES.some(phrase => 
    lowerUserMsg.includes(phrase)
  );
  
  const isShortConfirmation = /^(ok|legal|beleza|blz|show|top|massa|sim|tá|ta|entendi|certo|combinado|fechado|perfeito|ótimo|otimo)$/i.test(lowerUserMsg);
  
  if (lastAssistantMessage) {
    const assistantAskedDirectQuestion = lastAssistantMessage.trim().endsWith('?') && 
      !lastAssistantMessage.toLowerCase().includes('quer continuar') &&
      !lastAssistantMessage.toLowerCase().includes('quer remarcar');
    
    if (assistantAskedDirectQuestion && isShortConfirmation) {
      return false;
    }
  }
  
  if (hasClosingPhrase) {
    return true;
  }
  
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

async function generateContextualFollowup(
  supabase: any,
  userId: string,
  conversationContext: string | null,
  isSessionActive: boolean,
  userPlan: string,
  hoursAgo: number
): Promise<string> {
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

  // Fallback to predefined messages
  let messageSet: string[];
  
  if (isSessionActive) {
    messageSet = FOLLOWUP_MESSAGES_SESSION_ACTIVE;
  } else if (userPlan !== 'essencial') {
    messageSet = FOLLOWUP_MESSAGES_SESSION_PLANS;
  } else {
    messageSet = FOLLOWUP_MESSAGES_ESSENCIAL;
  }
  
  return messageSet[Math.floor(Math.random() * messageSet.length)];
}

// Função para obter hora atual em São Paulo de forma confiável
function getSaoPauloHour(): number {
  const now = new Date();
  const saoPauloOffset = -3 * 60;
  const utcMinutes = now.getTimezoneOffset();
  const saoPauloTime = new Date(now.getTime() + (utcMinutes + saoPauloOffset) * 60 * 1000);
  return saoPauloTime.getHours();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let dryRun = false;
    let targetUserId: string | null = null;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
      targetUserId = body?.target_user_id || null;
    } catch { /* no body */ }

    console.log(`🔄 Starting conversation follow-up check... (dry_run=${dryRun})`);

    // ===== QUIET HOURS: Não enviar follow-ups entre 22h e 8h =====
    const saoPauloHour = getSaoPauloHour();
    if (!dryRun && (saoPauloHour >= 22 || saoPauloHour < 8)) {
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
    const dryRunResults: any[] = [];
    const now = Date.now();

    for (const followup of followups || []) {
      try {
        // Buscar profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('name, phone, status, plan, current_session_id, do_not_disturb_until, whatsapp_instance_id, last_message_date, trial_started_at, trial_insight_sent_at')
          .eq('user_id', followup.user_id)
          .maybeSingle();
        
        if (profileError) {
          console.error(`⚠️ Error fetching profile for ${followup.user_id}:`, profileError);
          continue;
        }
        
        // Skip if no phone, or user is not active/trial
        const isActiveOrTrial = profile?.status === 'active' || profile?.status === 'trial';
        if (!profile?.phone || !isActiveOrTrial) {
          console.log(`⏭️ Skipping user ${followup.user_id}: no phone or inactive (status: ${profile?.status})`);
          continue;
        }

        // Auto-silence: skip if user hasn't messaged in 7+ days
        const lastMsg = profile.last_message_date ? new Date(profile.last_message_date) : null;
        if (lastMsg && (Date.now() - lastMsg.getTime()) > 7 * 24 * 60 * 60 * 1000) {
          console.log(`🔇 Auto-silenced: ${profile.name} (7+ days inactive)`);
          continue;
        }

        // Skip if do_not_disturb is active
        if (profile.do_not_disturb_until && new Date(profile.do_not_disturb_until) > new Date()) {
          console.log(`🔇 Skipping user ${followup.user_id} - do not disturb until ${profile.do_not_disturb_until}`);
          continue;
        }

        // Skip if user has pending scheduled tasks
        const { data: pendingTasks } = await supabase
          .from('scheduled_tasks')
          .select('id')
          .eq('user_id', followup.user_id)
          .eq('status', 'pending')
          .limit(1);

        if (pendingTasks && pendingTasks.length > 0) {
          console.log(`⏭️ Skipping user ${followup.user_id} - has pending scheduled task`);
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
          .limit(20);
        
        const lastUserMessage = recentMessages?.find((m: any) => m.role === 'user');
        const lastAssistantMessage = recentMessages?.find((m: any) => m.role === 'assistant');
        
        // Se last_user_message_at for null, a conversa foi INTENCIONALMENTE encerrada
        if (!followup.last_user_message_at) {
          console.log(`⏭️ Skipping user ${followup.user_id}: conversation intentionally ended (last_user_message_at is null)`);
          continue;
        }
        
        // 24h WINDOW GUARD: Don't send follow-up if WhatsApp 24h window is closed
        const lastUserMsgTime = new Date(followup.last_user_message_at).getTime();
        const hoursSinceLastMsg = (Date.now() - lastUserMsgTime) / (1000 * 60 * 60);
        if (hoursSinceLastMsg > 24) {
          console.log(`🔒 Skipping user ${followup.user_id}: WhatsApp 24h window closed (${Math.round(hoursSinceLastMsg)}h ago)`);
          continue;
        }
        
        // Calcular tempo desde última mensagem
        const lastUserMessageAt = new Date(followup.last_user_message_at).getTime();
        const timeSinceLastUserMsg = (now - lastUserMessageAt) / 60000; // em minutos
        const hoursAgo = timeSinceLastUserMsg / 60;
        
        // DETECTAR FIM NATURAL DE CONVERSA
        const isNaturalEnd = lastUserMessage && lastAssistantMessage
          ? isNaturalConversationEnd(lastUserMessage.content, lastAssistantMessage.content)
          : false;
        
        // EXTRAIR CONTEXTO DA CONVERSA (se não tiver salvo ou for muito genérico)
        let conversationContext = followup.conversation_context;
        if (!conversationContext || conversationContext.length < 10 || 
            !conversationContext.includes('TEMA:') ||
            ['ok', 'legal', 'beleza', 'sim', 'não'].includes(conversationContext.toLowerCase())) {
          conversationContext = await extractConversationContext(supabase, followup.user_id, recentMessages || []);
          
          if (conversationContext) {
            await supabase
              .from('conversation_followups')
              .update({ conversation_context: conversationContext })
              .eq('id', followup.id);
          }
        }
        
        // ===== REGRA SIMPLIFICADA DE TIMING =====
        // Fim natural → zero follow-ups (pula direto)
        // Qualquer outro caso → 15 min, max 1
        const timeThresholdMinutes = 15;
        const maxFollowups = 1;
        let timingReason: string;
        
        if (isNaturalEnd) {
          // Efeito Espelho: schedule a personalized trial insight 45-90 min after natural end
          const isTrial = profile.status === 'trial';
          if (isTrial && !profile.trial_insight_sent_at) {
            const substantialMessages = recentMessages?.filter(
              (m: any) => m.role === 'user' && m.content.trim().split(/\s+/).length > 10
            ) || [];
            if (substantialMessages.length >= 6) {
              const delayMinutes = 45 + Math.floor(Math.random() * 46); // 45–90 min
              const executeAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
              await supabase.from('scheduled_tasks').insert({
                user_id: followup.user_id,
                task_type: 'trial_insight',
                execute_at: executeAt,
                status: 'pending',
                payload: { scheduled_at: new Date().toISOString() },
              });
              console.log(`🪞 Scheduled trial insight for ${followup.user_id} in ${delayMinutes}min`);
            } else {
              console.log(`⏭️ Trial insight skipped for ${followup.user_id}: only ${substantialMessages.length} substantial messages (need 6)`);
            }
          }
          console.log(`⏭️ Skipping ${followup.user_id}: natural conversation end detected — zero follow-ups`);
          skippedNaturalEnd++;
          continue;
        }

        // Trial users only receive the mirror effect (scheduled above on natural end).
        // Skip regular follow-ups for them entirely.
        if (profile?.status === 'trial') {
          console.log(`⏭️ Skipping regular follow-up for trial user ${followup.user_id}`);
          continue;
        }

        if (isSessionActive) {
          timingReason = 'IN_SESSION';
        } else {
          timingReason = 'INTERRUPTED';
        }

        // LOG
        console.log(`🔍 User ${followup.user_id}:`, {
          plan: userPlan,
          isSessionActive,
          timingReason,
          timeSinceLastUserMsg_min: Math.round(timeSinceLastUserMsg),
          followup_count: followup.followup_count,
          conversationContext,
        });

        const timeThreshold = timeThresholdMinutes * 60 * 1000;
        const lastFollowupAt = followup.last_followup_at ? new Date(followup.last_followup_at).getTime() : 0;

        // Verificar se passou tempo suficiente desde última mensagem do usuário
        if (now - lastUserMessageAt < timeThreshold) {
          console.log(`⏭️ Skipping ${followup.user_id}: not enough time (${Math.round(timeSinceLastUserMsg)}/${timeThresholdMinutes} min)`);
          continue;
        }

        // Verificar se já atingiu limite de follow-ups (max 1)
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
          conversationContext,
          isSessionActive,
          userPlan,
          hoursAgo
        );

        // Tratar resposta SKIP
        if (message === 'SKIP' || message.trim().toUpperCase() === 'SKIP') {
          console.log(`⚠️ Skipping follow-up for ${followup.user_id}: context indicates sensitive situation`);
          continue;
        }

        console.log(`📤 Sending follow-up #${followup.followup_count + 1} to ${profile.phone} (${timingReason})`);

        if (dryRun) {
          dryRunResults.push({
            user_id: followup.user_id,
            name: profile.name,
            message,
            timingReason,
            conversationContext,
            followup_count: followup.followup_count,
            isSessionActive,
            isNaturalEnd,
          });
          sentCount++;
          continue;
        }

        // Send via WhatsApp with instance routing
        const instanceConfig = await getInstanceConfigForUser(supabase, followup.user_id);
        const sendResult = await sendProactive(profile.phone, message, 'followup', followup.user_id);

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

    const responsePayload: any = {
      status: 'success',
      totalConversations: followups?.length || 0,
      followupsSent: sentCount,
      skippedNaturalEnd,
    };
    if (dryRun) {
      responsePayload.dry_run = true;
      responsePayload.followups = dryRunResults;
    }

    return new Response(JSON.stringify(responsePayload), {
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
