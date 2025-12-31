import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function analyzeWeekConversations(
  messages: any[],
  userName: string
): Promise<string> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  
  if (!lovableApiKey || messages.length === 0) {
    return '';
  }

  // Prepare conversation summary for analysis
  const conversationSummary = messages
    .slice(-50) // Last 50 messages max
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
        model: 'google/gemini-2.5-pro',
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

function generateWeeklyReport(
  profile: any,
  checkins: any[],
  completedCommitments: any[],
  pendingCommitments: any[],
  insights: any[],
  evolutionAnalysis: string
): string {
  const name = profile.name?.split(' ')[0] || 'você';
  
  let report = `📊 *Seu Relatório Semanal, ${name}!*\n\n`;

  // Evolution analysis (AI-generated)
  if (evolutionAnalysis) {
    report += `*🌱 Sua Evolução*\n`;
    report += `${evolutionAnalysis}\n\n`;
  }

  // Mood & Energy summary
  if (checkins.length > 0) {
    const avgMood = checkins.reduce((sum, c) => sum + (c.mood || 0), 0) / checkins.length;
    const avgEnergy = checkins.reduce((sum, c) => sum + (c.energy || 0), 0) / checkins.length;
    
    report += `*💜 Bem-estar*\n`;
    report += `• Humor médio: ${avgMood.toFixed(1)}/10 ${avgMood >= 7 ? '😊' : avgMood >= 5 ? '😐' : '😔'}\n`;
    report += `• Energia média: ${avgEnergy.toFixed(1)}/10 ${avgEnergy >= 7 ? '⚡' : avgEnergy >= 5 ? '🔋' : '🪫'}\n`;
    report += `• Check-ins realizados: ${checkins.length}\n\n`;
  } else {
    report += `*💜 Bem-estar*\n`;
    report += `Nenhum check-in registrado essa semana. Que tal começar amanhã?\n\n`;
  }

  // Commitments summary
  report += `*🎯 Compromissos*\n`;
  if (completedCommitments.length > 0) {
    report += `✅ Concluídos: ${completedCommitments.length}\n`;
    completedCommitments.slice(0, 3).forEach(c => {
      report += `   • ${c.title}\n`;
    });
  }
  if (pendingCommitments.length > 0) {
    report += `⏳ Em andamento: ${pendingCommitments.length}\n`;
    pendingCommitments.slice(0, 3).forEach(c => {
      report += `   • ${c.title}\n`;
    });
  }
  if (completedCommitments.length === 0 && pendingCommitments.length === 0) {
    report += `Nenhum compromisso registrado essa semana.\n`;
  }
  report += `\n`;

  // Key insights
  if (insights.length > 0) {
    report += `*💡 Observações*\n`;
    const recentInsights = insights
      .sort((a, b) => b.mentioned_count - a.mentioned_count)
      .slice(0, 3);
    recentInsights.forEach(i => {
      report += `• ${i.key}: ${i.value}\n`;
    });
    report += `\n`;
  }

  // Closing message
  if (evolutionAnalysis || completedCommitments.length > 0) {
    report += `🌟 *Você está evoluindo!* Continue assim, ${name}. Estou orgulhosa de você!`;
  } else if (checkins.length > 0) {
    report += `💪 *Boa semana!* Vamos juntos na próxima também. Conte comigo!`;
  } else {
    report += `💜 *Nova semana, novas oportunidades!* Estou aqui pra te apoiar. Vamos conversar?`;
  }

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

    const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID')!;
    const zapiToken = Deno.env.get('ZAPI_TOKEN')!;

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
        // Get week's messages for AI analysis
        const { data: weekMessages } = await supabase
          .from('messages')
          .select('*')
          .eq('user_id', profile.user_id)
          .gte('created_at', weekStart.toISOString())
          .order('created_at', { ascending: true });

        // Get week's check-ins
        const { data: checkins } = await supabase
          .from('checkins')
          .select('*')
          .eq('user_id', profile.user_id)
          .gte('created_at', weekStart.toISOString());

        // Get completed commitments this week
        const { data: completedCommitments } = await supabase
          .from('commitments')
          .select('*')
          .eq('user_id', profile.user_id)
          .eq('completed', true)
          .gte('created_at', weekStart.toISOString());

        // Get pending commitments
        const { data: pendingCommitments } = await supabase
          .from('commitments')
          .select('*')
          .eq('user_id', profile.user_id)
          .eq('completed', false);

        // Get user insights
        const { data: insights } = await supabase
          .from('user_insights')
          .select('*')
          .eq('user_id', profile.user_id)
          .order('mentioned_count', { ascending: false })
          .limit(5);

        // Analyze conversations with AI
        const userName = profile.name?.split(' ')[0] || 'usuário';
        console.log(`🧠 Analyzing ${weekMessages?.length || 0} messages for ${userName}...`);
        
        const evolutionAnalysis = await analyzeWeekConversations(
          weekMessages || [],
          userName
        );
        
        if (evolutionAnalysis) {
          console.log(`✅ Evolution analysis generated for ${userName}`);
        }

        // Generate report
        const report = generateWeeklyReport(
          profile,
          checkins || [],
          completedCommitments || [],
          pendingCommitments || [],
          insights || [],
          evolutionAnalysis
        );

        // Send via Z-API
        const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN')!;
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
              message: report,
            }),
          }
        );

        if (sendResponse.ok) {
          console.log(`✅ Report sent to ${profile.name} (${profile.phone})`);
          sentCount++;

          // Save report to messages
          await supabase.from('messages').insert({
            user_id: profile.user_id,
            role: 'assistant',
            content: report,
          });

          // Save weekly plan record
          await supabase.from('weekly_plans').upsert({
            user_id: profile.user_id,
            week_start: weekStart.toISOString().split('T')[0],
            reflections: evolutionAnalysis || `Relatório enviado em ${now.toISOString()}`,
          }, {
            onConflict: 'user_id,week_start'
          });

        } else {
          const error = await sendResponse.text();
          console.error(`❌ Failed to send report to ${profile.phone}: ${error}`);
        }

        // Delay between sends
        await new Promise(resolve => setTimeout(resolve, 1500));

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