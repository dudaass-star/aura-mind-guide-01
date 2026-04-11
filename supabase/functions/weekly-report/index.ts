import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { sendMessage, sendProactive } from "../_shared/whatsapp-provider.ts";
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

// Helper to get or create portal token for a user
async function getOrCreatePortalToken(supabase: any, userId: string): Promise<string | null> {
  try {
    // Try to get existing token
    const { data: existing } = await supabase
      .from('user_portal_tokens')
      .select('token')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (existing?.token) return existing.token;

    // Create new token
    const { data: created } = await supabase
      .from('user_portal_tokens')
      .upsert({ user_id: userId }, { onConflict: 'user_id' })
      .select('token')
      .single();
    
    return created?.token || null;
  } catch {
    return null;
  }
}

// Helper to create short link
async function createShortLink(supabaseUrl: string, serviceKey: string, url: string, phone?: string): Promise<string | null> {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/create-short-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ url, phone }),
    });
    if (resp.ok) {
      const data = await resp.json();
      return data.shortUrl || null;
    }
    return null;
  } catch {
    return null;
  }
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

    console.log(`📅 Monthly report batch: offset=${offset}, batch_size=${batchSize}, dry_run=${dryRun}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate week range
    const now = new Date();
    const weekStart = new Date(weekStartOverride || now);
    if (!weekStartOverride) {
      weekStart.setDate(now.getDate() - 30);
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
        // Auto-silence: skip if user hasn't messaged in 7+ days
        const lastMsg = profile.last_message_date ? new Date(profile.last_message_date) : null;
        if (lastMsg && (Date.now() - lastMsg.getTime()) > 7 * 24 * 60 * 60 * 1000) {
          console.log(`🔇 Auto-silenced: ${profile.name} (7+ days inactive)`);
          continue;
        }

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
            console.log(`⏭️ Skipping ${userName} - already received report this month`);
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
        const report = generateMonthlyReport(profile, evolutionAnalysis, metrics);

        if (dryRun) {
          dryRunResults.push({ user_id: profile.user_id, name: profile.name, report, metrics, evolutionAnalysis });
          sentCount++;
          continue;
        }

        // Save report to monthly_reports table
        const reportMonth = new Date();
        reportMonth.setDate(1); // first of current month
        const reportMonthStr = reportMonth.toISOString().split('T')[0];

        await supabase.from('monthly_reports').upsert({
          user_id: profile.user_id,
          report_month: reportMonthStr,
          metrics_json: metrics,
          analysis_text: evolutionAnalysis || null,
          report_html: report,
        }, { onConflict: 'user_id,report_month' });

        // Get portal token and create short link
        const portalToken = await getOrCreatePortalToken(supabase, profile.user_id);
        const portalUrl = portalToken
          ? `https://olaaura.com.br/meu-espaco?t=${portalToken}&tab=resumos`
          : 'https://olaaura.com.br';
        
        const shortLink = await createShortLink(supabaseUrl, supabaseServiceKey, portalUrl, profile.phone) || portalUrl;

        // Build teaser message with personalized link
        const monthNames = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
        const currentMonth = monthNames[new Date().getMonth()];
        const teaser = `Oi, ${userName}! Seu resumo de ${currentMonth} está pronto 📊✨\n\nVeja aqui: ${shortLink}\n\n— Aura 💜`;

        // Save teaser with link as pending_insight so if template is sent (outside 24h window),
        // when user clicks "Ver meu resumo" the link is delivered inside the opened window
        try {
          await supabase.from('profiles').update({
            pending_insight: `[WEEKLY_REPORT]${teaser}`,
          }).eq('user_id', profile.user_id);
        } catch { /* non-blocking */ }

        // Send teaser via WhatsApp (inside window: sends teaser directly; outside: sends template)
        const zapiConfig = await getInstanceConfigForUser(supabase, profile.user_id);
        const cleanPhone = cleanPhoneNumber(profile.phone);
        const result = await sendProactive(cleanPhone, teaser, 'weekly_report', profile.user_id);

        if (result.success) {
          console.log(`✅ Report teaser sent to ${profile.name} (${profile.phone})`);
          sentCount++;

          // If sent as free text (inside window), clear pending since user already got the link
          if (result.provider === 'official' || result.provider === 'zapi') {
            // Check if it was sent as template or freetext by checking the teaser was delivered
            // For simplicity, always keep pending — aura-agent will clear it on next interaction
          }

          // Save message and mark as sent (dedup)
          await Promise.all([
            supabase.from('messages').insert({
              user_id: profile.user_id,
              role: 'assistant',
              content: teaser,
            }),
            supabase.from('weekly_plans').upsert({
              user_id: profile.user_id,
              week_start: weekStart.toISOString().split('T')[0],
              reflections: evolutionAnalysis || `Relatório enviado em ${now.toISOString()}`,
            }, { onConflict: 'user_id,week_start' }),
          ]);
        } else {
          console.error(`❌ Failed to send report teaser to ${profile.phone}: ${result.error}`);
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
    console.error('❌ Monthly report error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
