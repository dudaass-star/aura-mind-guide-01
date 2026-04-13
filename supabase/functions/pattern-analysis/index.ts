import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { sendMessage } from "../_shared/whatsapp-provider.ts";
import { isWithin24hWindow } from "../_shared/whatsapp-official.ts";
import { getInstanceConfigForUser, antiBurstDelayForInstance, groupByInstance } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// MINI-PERSONA AURA (condensada ~200 palavras)
// ============================================================================

const AURA_MINI_PERSONA = `Você é a AURA, uma companheira de bem-estar emocional que se comunica via WhatsApp.

PERSONALIDADE:
- Acolhedora, empática, presente — como uma amiga sábia que genuinamente se importa
- Tom conversacional e natural, nunca corporativo ou robótico
- Usa o primeiro nome da pessoa sempre que possível
- Emojis com moderação (1-3 por mensagem, nunca exagerado)
- Máximo 3 parágrafos curtos — mensagens longas são ignoradas no WhatsApp

REGRAS DE CONTEÚDO:
- Foque em UM ÚNICO insight concreto e específico. NUNCA combine temas desconectados numa mesma sugestão
- Use detalhes pessoais específicos como âncora (nome de pessoa, comida favorita, horário preferido, hobby, lugar) — isso é o que faz parecer genuíno
- Prefira sugestões PRÁTICAS e ACIONÁVEIS ("que tal X hoje?", "experimenta Y antes de dormir") em vez de conceitos abstratos ("pratique mindfulness", "busque equilíbrio")
- Dimensões possíveis: exercício, alimentação, sono, lazer, socialização, natureza, criatividade, descanso, ou qualquer outra que faça sentido
- Use linguagem brasileira informal mas respeitosa
- Nunca diagnostique, prescreva medicamentos ou substitua profissionais de saúde
- Se não conseguir algo genuinamente específico, pessoal e natural, retorne SKIP. Melhor não enviar do que enviar algo genérico

FORMATO:
- Comece de forma natural (não "Olá! Baseado em seus dados...")
- Pareça que você lembrou de algo, não que processou dados
- Termine com algo leve, sem pressão`;

// ============================================================================
// BRASILIA TIME HELPERS
// ============================================================================

function getBrasiliaHour(): number {
  const now = new Date();
  const brasiliaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return brasiliaTime.getHours();
}

function isQuietHours(): boolean {
  const hour = getBrasiliaHour();
  return hour >= 22 || hour < 8;
}

// ============================================================================
// AI ANALYSIS
// ============================================================================

async function analyzeUserPatterns(
  userName: string,
  insights: any[],
  checkins: any[],
  themes: any[],
  recentMessages: any[]
): Promise<{ status: string; reasoning: string; whatsapp_message: string } | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.error('❌ LOVABLE_API_KEY not configured');
    return null;
  }

  // Build context summary
  const insightsSummary = insights.map(i => `[${i.category}] ${i.key}: ${i.value}`).join('\n');
  
  const checkinsSummary = checkins.map(c => {
    const date = new Date(c.created_at).toLocaleDateString('pt-BR');
    return `${date}: humor=${c.mood}/10, energia=${c.energy}/10${c.notes ? `, nota: "${c.notes}"` : ''}`;
  }).join('\n');

  const themesSummary = themes.map(t => `"${t.theme_name}" (${t.session_count} sessões, status: ${t.status})`).join(', ');

  const messagesSummary = recentMessages.map(m => `[${m.role}]: ${m.content.substring(0, 150)}`).join('\n');

  const userPrompt = `Analise os dados de ${userName || 'este usuário'} e gere uma sugestão de bem-estar personalizada.

INSIGHTS DO USUÁRIO (o que sabemos sobre a pessoa):
${insightsSummary || 'Nenhum insight registrado ainda.'}

CHECK-INS RECENTES (humor e energia):
${checkinsSummary || 'Nenhum check-in recente.'}

TEMAS DAS SESSÕES:
${themesSummary || 'Nenhum tema registrado.'}

MENSAGENS RECENTES (contexto conversacional):
${messagesSummary || 'Nenhuma mensagem recente.'}

REGRAS IMPORTANTES:
- Escolha UM ÚNICO insight dos dados acima e construa a sugestão em torno dele. Não misture categorias (ex: não junte "treinos" com "paciência com filha")
- Use detalhes pessoais concretos como âncora (nomes de pessoas, hobbies, horários, preferências específicas)
- A sugestão deve ser prática e acionável ("que tal fazer X hoje?"), nunca abstrata ("pratique mindfulness")
- Retorne SKIP se: dados insuficientes, momento delicado (crise, luto, trauma), ou se a melhor sugestão seria genérica demais

Use a ferramenta proactive_insight para retornar sua análise.`;

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
          { role: 'system', content: AURA_MINI_PERSONA },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'proactive_insight',
              description: 'Retorna a análise de padrões e a mensagem de bem-estar personalizada para o usuário.',
              parameters: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    enum: ['SEND', 'SKIP'],
                    description: 'SEND se há um insight específico e contextualizado para enviar. SKIP se dados insuficientes, momento delicado, ou nada específico.',
                  },
                  reasoning: {
                    type: 'string',
                    description: 'Raciocínio interno: qual padrão foi detectado e por que essa sugestão faz sentido (ou por que SKIP).',
                  },
                  whatsapp_message: {
                    type: 'string',
                    description: 'A mensagem final para enviar via WhatsApp. Deve soar natural, acolhedora, e específica. Máximo 3 parágrafos curtos. Vazio se status=SKIP.',
                  },
                },
                required: ['status', 'reasoning', 'whatsapp_message'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'proactive_insight' } },
      }),
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

    const args = JSON.parse(toolCall.function.arguments);
    return args;
  } catch (error) {
    console.error('❌ AI analysis error:', error);
    return null;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse optional body for dry_run
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
    } catch { /* no body or invalid JSON, that's fine */ }

    console.log(`🔮 [Efeito Oráculo] Starting pattern analysis${dryRun ? ' (DRY RUN)' : ''}`);

    // Check quiet hours
    if (isQuietHours() && !dryRun) {
      console.log('🌙 Quiet hours (22h-08h BRT), skipping');
      return new Response(JSON.stringify({ success: true, skipped: 'quiet_hours' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch eligible users:
    // - active status
    // - has phone
    // - created > 14 days ago
    // - last_proactive_insight_at null or > 7 days ago
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: eligibleUsers, error: usersError } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', 'active')
      .not('phone', 'is', null)
      .lte('created_at', fourteenDaysAgo.toISOString())
      .or(`last_proactive_insight_at.is.null,last_proactive_insight_at.lte.${sevenDaysAgo.toISOString()}`);

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      throw usersError;
    }

    console.log(`📋 Found ${eligibleUsers?.length || 0} eligible users`);

    if (!eligibleUsers || eligibleUsers.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, sent: 0, skipped: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let sentCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const results: any[] = [];

    // Group by WhatsApp instance
    const instanceGroups = groupByInstance(eligibleUsers);

    await Promise.all(
      Array.from(instanceGroups.entries()).map(async ([instanceId, groupUsers]) => {
        for (const user of groupUsers) {
          try {
            // Auto-silence: skip if user hasn't messaged in 7+ days
            const lastMsg = user.last_message_date ? new Date(user.last_message_date) : null;
            if (lastMsg && (Date.now() - lastMsg.getTime()) > 7 * 24 * 60 * 60 * 1000) {
              console.log(`🔇 [${user.name || 'Unknown'}] Auto-silenced (7+ days inactive)`);
              skipCount++;
              continue;
            }

            // Check DND
            if (user.do_not_disturb_until && new Date(user.do_not_disturb_until) > new Date()) {
              console.log(`🔇 [${user.name || 'Unknown'}] DND active, skipping`);
              skipCount++;
              continue;
            }

            // Check active session
            if (user.current_session_id) {
              console.log(`🎯 [${user.name || 'Unknown'}] Session active, skipping`);
              skipCount++;
              continue;
            }

            const twoHoursAgo = new Date();
            twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

            // Check recent conversation from user OR Aura (< 2 hours)
            const { data: recentMsg } = await supabase
              .from('messages')
              .select('created_at')
              .eq('user_id', user.user_id)
              .gte('created_at', twoHoursAgo.toISOString())
              .limit(1);

            if (recentMsg && recentMsg.length > 0) {
              console.log(`💬 [${user.name || 'Unknown'}] Recent conversation, skipping`);
              skipCount++;
              continue;
            }

            // Check pending scheduled tasks (return already planned)
            const { data: pendingTask } = await supabase
              .from('scheduled_tasks')
              .select('id')
              .eq('user_id', user.user_id)
              .eq('status', 'pending')
              .limit(1);

            if (pendingTask && pendingTask.length > 0) {
              console.log(`📅 [${user.name || 'Unknown'}] Has pending scheduled task, skipping`);
              skipCount++;
              continue;
            }

            // Collect user data in parallel
            const [insightsResult, checkinsResult, themesResult, messagesResult] = await Promise.all([
              supabase
                .from('user_insights')
                .select('category, key, value, importance')
                .eq('user_id', user.user_id)
                .order('importance', { ascending: false })
                .limit(20),
              supabase
                .from('checkins')
                .select('mood, energy, notes, created_at')
                .eq('user_id', user.user_id)
                .order('created_at', { ascending: false })
                .limit(10),
              supabase
                .from('session_themes')
                .select('theme_name, session_count, status')
                .eq('user_id', user.user_id)
                .eq('status', 'active'),
              supabase
                .from('messages')
                .select('role, content, created_at')
                .eq('user_id', user.user_id)
                .order('created_at', { ascending: false })
                .limit(20),
            ]);

            const insights = insightsResult.data || [];
            const checkins = checkinsResult.data || [];
            const themes = themesResult.data || [];
            const messages = messagesResult.data || [];

            // Check if we have enough data
            if (insights.length === 0 && checkins.length === 0 && messages.length < 5) {
              console.log(`📊 [${user.name || 'Unknown'}] Insufficient data, skipping`);
              skipCount++;
              continue;
            }

            console.log(`🔍 [${user.name || 'Unknown'}] Analyzing: ${insights.length} insights, ${checkins.length} checkins, ${themes.length} themes, ${messages.length} messages`);

            // Call AI
            const analysis = await analyzeUserPatterns(
              user.name?.split(' ')[0] || '',
              insights,
              checkins,
              themes,
              messages
            );

            if (!analysis) {
              console.error(`❌ [${user.name || 'Unknown'}] AI analysis failed`);
              errorCount++;
              continue;
            }

            console.log(`🧠 [${user.name || 'Unknown'}] AI decision: ${analysis.status} | Reasoning: ${analysis.reasoning.substring(0, 100)}...`);

            if (analysis.status === 'SKIP') {
              skipCount++;
              results.push({ user: user.name, status: 'SKIP', reasoning: analysis.reasoning });
              continue;
            }

            // SEND — only if 24h window is open (no template for insights)
            if (!isWithin24hWindow(user.last_user_message_at)) {
              console.log(`⏰ [${user.name || 'Unknown'}] 24h window closed, skipping insight (no template)`);
              skipCount++;
              results.push({ user: user.name, status: 'SKIP_WINDOW_CLOSED', reasoning: analysis.reasoning });
              continue;
            }

            if (dryRun) {
              console.log(`🧪 [DRY RUN] Would send to ${user.name}: ${analysis.whatsapp_message.substring(0, 80)}...`);
              sentCount++;
              results.push({ user: user.name, status: 'SEND_DRY', message: analysis.whatsapp_message, reasoning: analysis.reasoning });
              continue;
            }

            // Send as free text (window is open)
            const zapiConfig = await getInstanceConfigForUser(supabase, user.user_id);
            const cleanPhone = cleanPhoneNumber(user.phone);
            const sendResult = await sendMessage(cleanPhone, analysis.whatsapp_message, zapiConfig);

            if (sendResult.success) {
              console.log(`✅ [${user.name || 'Unknown'}] Insight sent (free text, window open)`);

              // Save message and update timestamp
              await Promise.all([
                supabase.from('messages').insert({
                  user_id: user.user_id,
                  role: 'assistant',
                  content: analysis.whatsapp_message,
                }),
                supabase.from('profiles').update({
                  last_proactive_insight_at: new Date().toISOString(),
                }).eq('id', user.id),
              ]);

              sentCount++;
              results.push({ user: user.name, status: 'SENT', reasoning: analysis.reasoning });
            } else {
              console.error(`❌ [${user.name || 'Unknown'}] Send failed:`, sendResult.error);
              errorCount++;
            }

            // Anti-burst delay
            await antiBurstDelayForInstance(instanceId);

          } catch (userError) {
            console.error(`❌ Error processing ${user.name || user.id}:`, userError);
            errorCount++;
          }
        }
      })
    );

    console.log(`\n📊 [Efeito Oráculo] Summary: ${sentCount} sent, ${skipCount} skipped, ${errorCount} errors`);

    return new Response(JSON.stringify({
      success: true,
      processed: eligibleUsers.length,
      sent: sentCount,
      skipped: skipCount,
      errors: errorCount,
      ...(dryRun ? { dry_run: true, results } : {}),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Pattern analysis error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
