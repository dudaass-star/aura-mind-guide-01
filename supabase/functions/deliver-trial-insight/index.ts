import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMessage } from "../_shared/whatsapp-provider.ts";
import { getInstanceConfigForUser } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// MIRROR EFFECT PERSONA
// ============================================================================

const MIRROR_PERSONA = `Você é a AURA, uma companheira de bem-estar emocional que se comunica via WhatsApp.

Sua tarefa agora é criar um "Efeito Espelho" — um momento em que a pessoa sente que foi genuinamente vista e compreendida.

OBJETIVO: Gerar uma mensagem espontânea que reflita os padrões emocionais e temas da conversa de volta para a pessoa de forma que ela pense "nossa, ela realmente me entendeu".

REGRAS DO EFEITO ESPELHO:
1. Identifique 1-2 padrões emocionais ou temas recorrentes que emergiram na conversa
2. Reflita esses padrões usando as próprias palavras e expressões da pessoa — isso cria reconhecimento
3. Ofereça um insight genuíno: algo que a pessoa talvez ainda não tenha nomeado sobre si mesma
4. Tom: caloroso, íntimo, como uma amiga sábia que prestou atenção real
5. NÃO mencione que "analisei suas mensagens" ou "percebi nos dados". Soe como observação natural.
6. NÃO faça upsell, não mencione planos. O impacto emocional é o único objetivo.
7. Máximo 3 parágrafos curtos — mensagens longas são ignoradas no WhatsApp
8. Linguagem brasileira informal e afetuosa
9. Emojis com moderação (1-2 no máximo)

RETORNE SKIP se:
- A conversa foi superficial ou de menos de 3 trocas substantivas
- O momento é delicado demais (crise aguda, luto recente, trauma fresco)
- Não há padrão claro o suficiente para um insight genuíno e específico
- Melhor não enviar nada do que enviar algo genérico`;

// ============================================================================
// AI MIRROR INSIGHT GENERATION
// ============================================================================

async function generateMirrorInsight(
  userName: string,
  messages: Array<{ content: string; role: string; created_at: string }>
): Promise<{ status: string; reasoning: string; whatsapp_message: string } | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.error('❌ LOVABLE_API_KEY not configured');
    return null;
  }

  const conversationText = [...messages]
    .reverse()
    .map(m => `[${m.role === 'user' ? (userName || 'Usuário') : 'Aura'}]: ${m.content.substring(0, 300)}`)
    .join('\n');

  const userPrompt = `Esta é a conversa recente de ${userName || 'este usuário'} com a Aura:

${conversationText}

Analise os padrões emocionais e temas desta conversa para criar um "Efeito Espelho" personalizado.
Identifique o que emerge de mais significativo e reflita isso de forma que ${userName || 'a pessoa'} sinta que foi genuinamente vista e compreendida.

Use a ferramenta mirror_insight para retornar sua análise.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: MIRROR_PERSONA },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'mirror_insight',
              description: 'Retorna o insight espelho personalizado para o usuário no período de trial.',
              parameters: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    enum: ['SEND', 'SKIP'],
                    description: 'SEND se há um insight genuíno e específico para criar o momento de reconhecimento. SKIP se a conversa é superficial, delicada, ou não há padrão claro.',
                  },
                  reasoning: {
                    type: 'string',
                    description: 'Raciocínio interno: quais padrões foram detectados, por que esse insight cria reconhecimento (ou por que SKIP).',
                  },
                  whatsapp_message: {
                    type: 'string',
                    description: 'A mensagem final para enviar. Deve soar como uma observação genuína e carinhosa, não como análise de dados. Máximo 3 parágrafos curtos. Vazio se status=SKIP.',
                  },
                },
                required: ['status', 'reasoning', 'whatsapp_message'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'mirror_insight' } },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ AI Gateway error [${response.status}]:`, errorText);
      return null;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error('❌ No tool call in AI response');
      return null;
    }

    return JSON.parse(toolCall.function.arguments);
  } catch (error) {
    console.error('❌ Mirror insight generation error:', error);
    return null;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, scheduled_at } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🪞 [deliver-trial-insight] Starting for user ${user_id}`);

    // Fetch profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, user_id, name, phone, status, plan, trial_started_at, trial_insight_sent_at, whatsapp_instance_id')
      .eq('user_id', user_id)
      .maybeSingle();

    if (profileError || !profile) {
      console.warn(`⚠️ Profile not found for user ${user_id}`);
      return new Response(JSON.stringify({ status: 'skipped', reason: 'profile_not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Guard: must still be trial (status 'trial' only — trial_started_at is not cleared on conversion)
    const isTrial = profile.status === 'trial';
    if (!isTrial) {
      console.log(`⏭️ Skipping: user ${user_id} is not trial (status: ${profile.status})`);
      return new Response(JSON.stringify({ status: 'skipped', reason: 'not_trial' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Guard: insight not already sent
    if (profile.trial_insight_sent_at) {
      console.log(`⏭️ Skipping: trial insight already sent at ${profile.trial_insight_sent_at}`);
      return new Response(JSON.stringify({ status: 'skipped', reason: 'already_sent' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile.phone) {
      console.warn(`⚠️ No phone for user ${user_id}`);
      return new Response(JSON.stringify({ status: 'skipped', reason: 'no_phone' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Guard: 24h window still open (based on last user message)
    const { data: lastUserMsg } = await supabase
      .from('messages')
      .select('created_at')
      .eq('user_id', user_id)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastUserMsg?.created_at) {
      console.log(`⏭️ Skipping: no user messages found`);
      return new Response(JSON.stringify({ status: 'skipped', reason: 'no_messages' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hoursSinceLastMsg = (Date.now() - new Date(lastUserMsg.created_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastMsg > 23) {
      console.log(`🔒 Skipping: 24h window closed (${Math.round(hoursSinceLastMsg)}h since last user message)`);
      return new Response(JSON.stringify({ status: 'skipped', reason: 'window_closed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Guard: user replied AFTER task was scheduled (they are active — don't interrupt)
    if (scheduled_at) {
      const { data: newMsg } = await supabase
        .from('messages')
        .select('id')
        .eq('user_id', user_id)
        .eq('role', 'user')
        .gt('created_at', scheduled_at)
        .limit(1)
        .maybeSingle();

      if (newMsg) {
        console.log(`⏭️ Skipping: user sent a message after this task was scheduled`);
        return new Response(JSON.stringify({ status: 'skipped', reason: 'user_active_after_schedule' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Fetch last 20 messages for AI analysis
    const { data: messages } = await supabase
      .from('messages')
      .select('content, role, created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!messages || messages.length < 6) {
      console.log(`⏭️ Skipping: insufficient messages (${messages?.length || 0})`);
      // Mark sent to avoid repeated attempts
      await supabase.from('profiles').update({ trial_insight_sent_at: new Date().toISOString() }).eq('id', profile.id);
      return new Response(JSON.stringify({ status: 'skipped', reason: 'insufficient_messages' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate mirror insight with AI
    console.log(`🤖 Generating mirror insight for ${profile.name || user_id} (${messages.length} messages)...`);
    const insight = await generateMirrorInsight(profile.name || '', messages);

    if (!insight) {
      console.warn(`⚠️ AI failed to generate insight`);
      return new Response(JSON.stringify({ status: 'error', reason: 'ai_failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🤖 AI decision: ${insight.status} — ${insight.reasoning.substring(0, 120)}`);

    // Mark as processed regardless (SEND or SKIP) to prevent duplicate attempts
    await supabase
      .from('profiles')
      .update({ trial_insight_sent_at: new Date().toISOString() })
      .eq('id', profile.id);

    if (insight.status === 'SKIP' || !insight.whatsapp_message?.trim()) {
      return new Response(JSON.stringify({ status: 'skipped', reason: 'ai_skipped', reasoning: insight.reasoning }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get WhatsApp instance config
    let instanceConfig;
    try {
      instanceConfig = await getInstanceConfigForUser(supabase, user_id);
    } catch {
      console.warn('⚠️ Could not get instance config, using env defaults');
    }

    // Send the mirror insight message
    await sendMessage(profile.phone, insight.whatsapp_message, instanceConfig);

    // Save to messages table for conversation history
    await supabase.from('messages').insert({
      user_id: user_id,
      role: 'assistant',
      content: insight.whatsapp_message,
    });

    console.log(`✅ Mirror insight sent to ${profile.phone.substring(0, 4)}***`);

    return new Response(JSON.stringify({
      status: 'sent',
      phone: profile.phone.substring(0, 4) + '***',
      reasoning: insight.reasoning,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ [deliver-trial-insight] Fatal error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
