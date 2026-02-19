import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { getInstanceConfigForUser, antiBurstDelay } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  const { count: totalMessages } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  const { count: weekMessages } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', weekStart.toISOString());

  const { count: insightsCount } = await supabase
    .from('user_insights')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  const { count: sessionsCount } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'completed');

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
    totalMessages: totalMessages || 0,
    weekMessages: weekMessages || 0,
    insightsCount: insightsCount || 0,
    sessionsCount: sessionsCount || 0,
    journeyTitle,
    currentEpisode: currentEpisode || 0,
    journeysCompleted: journeysCompleted || 0,
  };
}

async function analyzeWeekConversations(
  messages: any[],
  userName: string
): Promise<string> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  
  if (!lovableApiKey || messages.length === 0) {
    return '';
  }

  const conversationSummary = messages
    .slice(-50)
    .map(m => `${m.role === 'user' ? userName : 'Aura'}: ${m.content}`)
    .join('\n');

  try {
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
            content: `Você é a Aura, uma coach de vida empática. Analise as conversas da semana e gere um parágrafo curto (máximo 3 frases) sobre:
- Os principais temas/questões trabalhados
- A evolução ou progresso percebido
- Um insight ou observação importante

Seja específica sobre o que foi discutido. Use linguagem acolhedora e direta. Não use bullet points, escreva em texto corrido.`
          },
          {
            role: 'user',
            content: `Analise as conversas desta semana com ${userName}:\n\n${conversationSummary}`
          }
        ],
        max_tokens: 200,
        temperature: 0.8,
      }),
    });

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

function generateProgressBar(current: number, total: number): string {
  const filled = Math.min(Math.floor((current / total) * 8), 8);
  const empty = 8 - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}

function generateWeeklyReport(
  profile: any,
  evolutionAnalysis: string,
  metrics: UserMetrics
): string {
  const name = profile.name?.split(' ')[0] || 'você';
  
  let report = `📊 *Seu Relatório Semanal, ${name}!*\n\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  report += `📈 *Seus Números*\n`;
  report += `💬 ${metrics.totalMessages} ${metrics.totalMessages === 1 ? 'mensagem' : 'mensagens'}`;
  if (metrics.weekMessages > 0) {
    report += ` (↑${metrics.weekMessages} esta semana)`;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📅 Starting weekly report generation...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate week range
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    // Get active users
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', 'active')
      .not('phone', 'is', null);

    if (profilesError) {
      throw new Error(`Error fetching profiles: ${profilesError.message}`);
    }

    console.log(`📋 Generating reports for ${profiles?.length || 0} users`);

    let sentCount = 0;

    for (const profile of profiles || []) {
      try {
        const userName = profile.name?.split(' ')[0] || 'usuário';
        
        console.log(`📊 Fetching metrics for ${userName}...`);
        const metrics = await fetchUserMetrics(
          supabase,
          profile.user_id,
          weekStart,
          profile.current_journey_id,
          profile.current_episode,
          profile.journeys_completed
        );
        
        console.log(`📈 Metrics for ${userName}: ${metrics.totalMessages} msgs, ${metrics.insightsCount} insights, ${metrics.sessionsCount} sessions`);

        const { data: weekMessages } = await supabase
          .from('messages')
          .select('*')
          .eq('user_id', profile.user_id)
          .gte('created_at', weekStart.toISOString())
          .order('created_at', { ascending: true });

        console.log(`🧠 Analyzing ${weekMessages?.length || 0} messages for ${userName}...`);
        
        const evolutionAnalysis = await analyzeWeekConversations(
          weekMessages || [],
          userName
        );
        
        if (evolutionAnalysis) {
          console.log(`✅ Evolution analysis generated for ${userName}`);
        }

        const report = generateWeeklyReport(profile, evolutionAnalysis, metrics);

        // Get instance config for this user
        const zapiConfig = await getInstanceConfigForUser(supabase, profile.user_id);

        const cleanPhone = cleanPhoneNumber(profile.phone);
        const result = await sendTextMessage(cleanPhone, report, undefined, zapiConfig);

        if (result.success) {
          console.log(`✅ Report sent to ${profile.name} (${profile.phone})`);
          sentCount++;

          await supabase.from('messages').insert({
            user_id: profile.user_id,
            role: 'assistant',
            content: report,
          });

          await supabase.from('weekly_plans').upsert({
            user_id: profile.user_id,
            week_start: weekStart.toISOString().split('T')[0],
            reflections: evolutionAnalysis || `Relatório enviado em ${now.toISOString()}`,
          }, {
            onConflict: 'user_id,week_start'
          });
        } else {
          console.error(`❌ Failed to send report to ${profile.phone}: ${result.error}`);
        }

        // Anti-burst delay between sends
        await antiBurstDelay();

      } catch (userError) {
        console.error(`❌ Error processing user ${profile.user_id}:`, userError);
      }
    }

    console.log(`📊 Weekly reports complete: ${sentCount}/${profiles?.length || 0} sent`);

    return new Response(JSON.stringify({ 
      status: 'success', 
      totalUsers: profiles?.length || 0,
      reportsSent: sentCount 
    }), {
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
