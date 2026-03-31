import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { getInstanceConfigForUser } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE_DEFAULT = 10;
const INTER_MESSAGE_DELAY_MS = 3000; // 3 seconds between sends (was 25-45s)

// ============================================================================
// METRICS
// ============================================================================

interface UserMetrics {
  totalMessages: number;
  weekMessages: number;
  insightsCount: number;
  sessionsCount: number;
  journeyTitle: string | null;
  currentEpisode: number;
  journeysCompleted: number;
}

async function fetchUserMetrics(
  supabase: any,
  userId: string,
  weekStart: Date,
  currentJourneyId: string | null,
  currentEpisode: number,
  journeysCompleted: number
): Promise<UserMetrics> {
  // Run all counts in parallel
  const [totalRes, weekRes, insightsRes, sessionsRes] = await Promise.all([
    supabase.from('messages').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('messages').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', weekStart.toISOString()),
    supabase.from('user_insights').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'completed'),
  ]);

  let journeyTitle: string | null = null;
  if (currentJourneyId) {
    const { data: journey } = await supabase
      .from('content_journeys')
      .select('title')
      .eq('id', currentJourneyId)
      .maybeSingle();
    journeyTitle = journey?.title || null;
  }

  return {
    totalMessages: totalRes.count || 0,
    weekMessages: weekRes.count || 0,
    insightsCount: insightsRes.count || 0,
    sessionsCount: sessionsRes.count || 0,
    journeyTitle,
    currentEpisode: currentEpisode || 0,
    journeysCompleted: journeysCompleted || 0,
  };
}

// ============================================================================
// AI ANALYSIS
// ============================================================================

async function analyzeWeekConversations(
  messages: any[],
  userName: string
): Promise<string> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey || messages.length === 0) return '';

  const conversationSummary = messages
    .slice(-50)
    .map(m => `${m.role === 'user' ? userName : 'Aura'}: ${m.content}`)
    .join('\n');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Você é a Aura, uma coach de vida empática. Analise as conversas do mês e gere um parágrafo curto (máximo 3 frases) sobre:
- Os principais temas/questões trabalhados
- A evolução ou progresso percebido
- Um insight ou observação importante

Seja específica sobre o que foi discutido. Use linguagem acolhedora e direta. Não use bullet points, escreva em texto corrido.`
          },
          {
            role: 'user',
            content: `Analise as conversas deste mês com ${userName}:\n\n${conversationSummary}`
          }
        ],
        max_tokens: 150,
        temperature: 0.8,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error('AI analysis error:', await response.text());
      return '';
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Error analyzing conversations:', error);
    return '';
  }
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateProgressBar(current: number, total: number): string {
  const filled = Math.min(Math.floor((current / total) * 8), 8);
  const empty = 8 - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}

function generateMonthlyReport(
  profile: any,
  evolutionAnalysis: string,
  metrics: UserMetrics
): string {
  const name = profile.name?.split(' ')[0] || 'você';
  
  let report = `📊 *Seu Relatório Mensal, ${name}!*\n\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  report += `📈 *Seus Números do Mês*\n`;
  report += `💬 ${metrics.totalMessages} ${metrics.totalMessages === 1 ? 'mensagem' : 'mensagens'}`;
  if (metrics.weekMessages > 0) {
    report += ` (↑${metrics.weekMessages} este mês)`;
  }
  report += `\n`;
  
  if (metrics.insightsCount > 0) {
    report += `🧠 ${metrics.insightsCount} ${metrics.insightsCount === 1 ? 'insight salvo' : 'insights salvos'} sobre você\n`;
  }
  
  if (metrics.sessionsCount > 0) {
    report += `📅 ${metrics.sessionsCount} ${metrics.sessionsCount === 1 ? 'sessão completada' : 'sessões completadas'}\n`;
  }
  
  report += `\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  if (metrics.journeyTitle) {
    const progressBar = generateProgressBar(metrics.currentEpisode, 8);
    const percent = Math.round((metrics.currentEpisode / 8) * 100);
    
    report += `🎯 *Sua Jornada: ${metrics.journeyTitle}*\n`;
    report += `${progressBar} Episódio ${metrics.currentEpisode} de 8 (${percent}%)\n`;
    
    if (metrics.journeysCompleted > 0) {
      report += `✅ ${metrics.journeysCompleted} ${metrics.journeysCompleted === 1 ? 'jornada desbloqueada' : 'jornadas desbloqueadas'}\n`;
    }
    
    report += `\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
  }
  
  if (evolutionAnalysis) {
    report += `🌱 *Sua Evolução*\n`;
    report += `${evolutionAnalysis}\n\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  }
  
  report += `✨ Continue assim, ${name}! Estou orgulhosa de você 💜`;
  
  return report;
}

// ============================================================================
// HELPERS
// ============================================================================

function getBrtHour(): number {
  return (new Date().getUTCHours() - 3 + 24) % 24;
}

async function shortDelay(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, INTER_MESSAGE_DELAY_MS));
}

// ============================================================================
// SELF-INVOCATION FOR NEXT BATCH
// ============================================================================

async function invokeNextBatch(
  offset: number,
  batchSize: number,
  weekStartStr: string,
  dryRun: boolean
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const url = `${supabaseUrl}/functions/v1/weekly-report`;
  console.log(`🔄 Invoking next batch: offset=${offset}, batch_size=${batchSize}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        offset,
        batch_size: batchSize,
        week_start_override: weekStartStr,
        dry_run: dryRun,
      }),
    });
    // Fire-and-forget: just consume the body
    await res.text();
  } catch (error) {
    console.error('❌ Error invoking next batch:', error);
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
    // Quiet hours guard: no messages between 22h and 8h BRT
    const brtHour = getBrtHour();
    if (brtHour < 8 || brtHour >= 22) {
      console.log(`🌙 Quiet hours (${brtHour}h BRT) - skipping monthly report`);
      return new Response(JSON.stringify({ status: 'skipped', reason: 'quiet_hours', brt_hour: brtHour }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse body
    let dryRun = false;
    let targetUserId: string | null = null;
    let offset = 0;
    let batchSize = BATCH_SIZE_DEFAULT;
    let weekStartOverride: string | null = null;

    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
      targetUserId = body?.target_user_id || null;
      offset = body?.offset || 0;
      batchSize = body?.batch_size || BATCH_SIZE_DEFAULT;
      weekStartOverride = body?.week_start_override || null;
    } catch { /* no body */ }

    console.log(`📅 Weekly report batch: offset=${offset}, batch_size=${batchSize}, dry_run=${dryRun}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate week range
    const now = new Date();
    const weekStart = new Date(weekStartOverride || now);
    if (!weekStartOverride) {
      weekStart.setDate(now.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);
    }
    const weekStartStr = weekStart.toISOString();

    // Build query
    let profilesQuery = supabase
      .from('profiles')
      .select('*')
      .eq('status', 'active')
      .not('phone', 'is', null)
      .order('created_at', { ascending: true });

    if (targetUserId) {
      profilesQuery = profilesQuery.eq('user_id', targetUserId);
    } else {
      profilesQuery = profilesQuery.or('do_not_disturb_until.is.null,do_not_disturb_until.lte.' + new Date().toISOString());
      profilesQuery = profilesQuery.range(offset, offset + batchSize - 1);
    }

    const { data: profiles, error: profilesError } = await profilesQuery;

    if (profilesError) {
      throw new Error(`Error fetching profiles: ${profilesError.message}`);
    }

    const profileCount = profiles?.length || 0;
    console.log(`📋 Batch has ${profileCount} users (offset=${offset})`);

    if (profileCount === 0) {
      console.log('✅ No more users to process. Batch complete.');
      return new Response(JSON.stringify({ status: 'complete', offset, reportsSent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let sentCount = 0;
    const dryRunResults: any[] = [];

    for (const profile of profiles!) {
      try {
        const userName = profile.name?.split(' ')[0] || 'usuário';

        // Skip if already received this week's report (dedup via weekly_plans)
        if (!dryRun && !targetUserId) {
          const weekStartDate = weekStart.toISOString().split('T')[0];
          const { data: existingPlan } = await supabase
            .from('weekly_plans')
            .select('id')
            .eq('user_id', profile.user_id)
            .eq('week_start', weekStartDate)
            .maybeSingle();

          if (existingPlan) {
            console.log(`⏭️ Skipping ${userName} - already received report this week`);
            continue;
          }
        }

        // Skip if user has an active session
        if (!dryRun && profile.current_session_id) {
          const { data: activeSession } = await supabase
            .from('sessions')
            .select('status')
            .eq('id', profile.current_session_id)
            .eq('status', 'in_progress')
            .maybeSingle();
          
          if (activeSession) {
            console.log(`🧘 Skipping ${userName} - session in progress`);
            continue;
          }
        }

        // Skip if user sent a message in the last 10 minutes
        if (!dryRun) {
          const recentCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const { count: recentUserMessages } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', profile.user_id)
            .eq('role', 'user')
            .gte('created_at', recentCutoff);

          if ((recentUserMessages || 0) > 0) {
            console.log(`💬 Skipping ${userName} - active conversation`);
            continue;
          }
        }

        // Fetch metrics and week messages in parallel
        const [metrics, weekMsgsRes] = await Promise.all([
          fetchUserMetrics(supabase, profile.user_id, weekStart, profile.current_journey_id, profile.current_episode, profile.journeys_completed),
          supabase.from('messages').select('*').eq('user_id', profile.user_id).gte('created_at', weekStartStr).order('created_at', { ascending: true }),
        ]);

        const evolutionAnalysis = await analyzeWeekConversations(weekMsgsRes.data || [], userName);
        const report = generateWeeklyReport(profile, evolutionAnalysis, metrics);

        if (dryRun) {
          dryRunResults.push({ user_id: profile.user_id, name: profile.name, report, metrics, evolutionAnalysis });
          sentCount++;
          continue;
        }

        // Send via WhatsApp
        const zapiConfig = await getInstanceConfigForUser(supabase, profile.user_id);
        const cleanPhone = cleanPhoneNumber(profile.phone);
        const result = await sendTextMessage(cleanPhone, report, undefined, zapiConfig);

        if (result.success) {
          console.log(`✅ Report sent to ${profile.name} (${profile.phone})`);
          sentCount++;

          // Save message and mark as sent (dedup)
          await Promise.all([
            supabase.from('messages').insert({
              user_id: profile.user_id,
              role: 'assistant',
              content: report,
            }),
            supabase.from('weekly_plans').upsert({
              user_id: profile.user_id,
              week_start: weekStart.toISOString().split('T')[0],
              reflections: evolutionAnalysis || `Relatório enviado em ${now.toISOString()}`,
            }, { onConflict: 'user_id,week_start' }),
          ]);
        } else {
          console.error(`❌ Failed to send report to ${profile.phone}: ${result.error}`);
        }

        // Short delay between sends
        await shortDelay();

      } catch (userError) {
        console.error(`❌ Error processing user ${profile.user_id}:`, userError);
      }
    }

    console.log(`📊 Batch complete: ${sentCount}/${profileCount} sent (offset=${offset})`);

    // If we got a full batch, there may be more users — invoke next batch
    if (!targetUserId && profileCount === batchSize) {
      // Don't await — fire and forget so this invocation can return
      invokeNextBatch(offset + batchSize, batchSize, weekStartStr, dryRun);
    }

    const responsePayload: any = {
      status: 'success',
      batch: { offset, batchSize, profilesInBatch: profileCount },
      reportsSent: sentCount,
      hasMore: profileCount === batchSize,
    };
    if (dryRun) {
      responsePayload.dry_run = true;
      responsePayload.reports = dryRunResults;
    }

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Weekly report error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
