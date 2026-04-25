// ============================================================================
// generate-monthly-letter
// ----------------------------------------------------------------------------
// CRON: dia 1 de cada mês às 10h BRT (13h UTC).
// Para cada usuário ativo (status active|trial), consolida marcos + insights +
// sessões dos últimos 30 dias e gera uma carta personalizada via gemini-2.5-pro.
//
// Persiste em public.monthly_letters (letter_text + preview_text) e dispara o
// template gatilho 'weekly_report' (aura_weekly_report_v2) via sendTemplateOnly.
//
// O PREVIEW é entregue pelo process-webhook-message quando o usuário responde
// e abre a janela 24h (campo delivered_at). A carta completa fica no portal.
//
// Idempotência: skip se já existe monthly_letters(user_id, letter_month).
// Respeita do_not_disturb_until.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTemplateOnly } from "../_shared/whatsapp-official.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface UserContext {
  user_id: string;
  name: string | null;
  phone: string;
  milestones: string[];
  insights: string[];
  themes: string[];
  sessions_count: number;
  primary_topic: string | null;
}

async function gatherContext(supabase: any, userId: string): Promise<{
  milestones: string[];
  insights: string[];
  themes: string[];
  sessions_count: number;
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [milestonesRes, insightsRes, themesRes, sessionsRes] = await Promise.all([
    supabase
      .from('user_milestones')
      .select('milestone_text')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('user_insights')
      .select('value')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo)
      .order('importance', { ascending: false })
      .limit(10),
    supabase
      .from('session_themes')
      .select('theme_name, session_count')
      .eq('user_id', userId)
      .gte('last_mentioned_at', thirtyDaysAgo)
      .order('session_count', { ascending: false })
      .limit(5),
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'concluida')
      .gte('ended_at', thirtyDaysAgo),
  ]);

  return {
    milestones: (milestonesRes.data || []).map((m: any) => m.milestone_text).filter(Boolean),
    insights: (insightsRes.data || []).map((i: any) => i.value).filter(Boolean),
    themes: (themesRes.data || []).map((t: any) => t.theme_name).filter(Boolean),
    sessions_count: sessionsRes.count || 0,
  };
}

async function generateLetter(ctx: UserContext): Promise<{ preview: string; letter: string } | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    console.error('❌ LOVABLE_API_KEY not configured');
    return null;
  }

  const firstName = ctx.name ? ctx.name.split(' ')[0] : 'você';

  const systemPrompt = `Você é a AURA, mentora terapêutica brasileira. Está escrevendo uma CARTA MENSAL pessoal para ${firstName}.

Tom: caloroso, direto, sem clichês de coach. Português brasileiro informal (tô, né). Sem emojis.
Estrutura da CARTA (300-450 palavras):
1. Abertura curta reconhecendo o mês que passou (sem floreios)
2. O que você observou: padrões, marcos, mudanças reais (cite específicos do contexto)
3. Uma reflexão honesta — pode ser desconfortável, é uma carta de mentora, não um abraço
4. Fechamento com uma pergunta provocativa para o próximo mês

PREVIEW (1 frase, máx 200 chars): teaser provocativo que faz a pessoa querer ler a carta completa. NÃO resumir. Deve criar curiosidade.`;

  const userPrompt = `Contexto dos últimos 30 dias de ${firstName}:
- Sessões concluídas: ${ctx.sessions_count}
- Marcos registrados: ${ctx.milestones.length > 0 ? ctx.milestones.join(' | ') : 'nenhum'}
- Temas recorrentes: ${ctx.themes.length > 0 ? ctx.themes.join(', ') : 'nenhum'}
- Insights guardados: ${ctx.insights.length > 0 ? ctx.insights.slice(0, 6).join(' | ') : 'nenhum'}
- Tópico principal: ${ctx.primary_topic || 'não definido'}

Gere a carta mensal e o preview.`;

  try {
    const response = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'emit_monthly_letter',
            description: 'Emite a carta mensal e seu preview teaser.',
            parameters: {
              type: 'object',
              properties: {
                letter: { type: 'string', description: 'Carta completa, 300-450 palavras.' },
                preview: { type: 'string', description: 'Teaser provocativo, máx 200 chars.' },
              },
              required: ['letter', 'preview'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'emit_monthly_letter' } },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`❌ AI Gateway error [${response.status}]: ${errBody.substring(0, 200)}`);
      return null;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error('❌ No tool_call in response');
      return null;
    }
    const args = JSON.parse(toolCall.function.arguments);
    if (!args.letter || !args.preview) return null;
    return { letter: args.letter, preview: args.preview.substring(0, 200) };
  } catch (e) {
    console.error('❌ generateLetter error:', e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const today = new Date();
  const nowIso = today.toISOString();
  // Mês de referência: primeiro dia do mês corrente
  const letterMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  console.log(`🌙 [generate-monthly-letter] Start | month=${letterMonth}`);

  const { data: users, error: usersErr } = await supabase
    .from('profiles')
    .select('user_id, name, phone, primary_topic, do_not_disturb_until, status')
    .in('status', ['active', 'trial'])
    .not('phone', 'is', null);

  if (usersErr) {
    console.error('❌ Error fetching users:', usersErr);
    return new Response(JSON.stringify({ error: 'fetch_users_failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`👥 ${users?.length || 0} usuários ativos candidatos`);

  let sent = 0, skipped = 0, failed = 0;

  for (const user of users || []) {
    try {
      // DND
      if (user.do_not_disturb_until && new Date(user.do_not_disturb_until) > today) {
        skipped++;
        continue;
      }

      // Idempotência
      const { data: existing } = await supabase
        .from('monthly_letters')
        .select('id')
        .eq('user_id', user.user_id)
        .eq('letter_month', letterMonth)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const ctx = await gatherContext(supabase, user.user_id);

      // Skip se contexto vazio (usuário recém-chegado, nada a contar)
      if (ctx.sessions_count === 0 && ctx.milestones.length === 0 && ctx.insights.length === 0) {
        skipped++;
        continue;
      }

      const result = await generateLetter({
        user_id: user.user_id,
        name: user.name,
        phone: user.phone,
        milestones: ctx.milestones,
        insights: ctx.insights,
        themes: ctx.themes,
        sessions_count: ctx.sessions_count,
        primary_topic: user.primary_topic,
      });

      if (!result) {
        failed++;
        continue;
      }

      // Persistir antes do envio (preview e letter_text). delivered_at fica null.
      const { error: insertErr } = await supabase
        .from('monthly_letters')
        .insert({
          user_id: user.user_id,
          letter_month: letterMonth,
          letter_text: result.letter,
          preview_text: result.preview,
          trigger_sent_at: nowIso,
        });

      if (insertErr) {
        console.error(`❌ Insert monthly_letters failed for ${user.user_id}:`, insertErr.message);
        failed++;
        continue;
      }

      // Disparar SEMPRE template gatilho 'weekly_report'.
      // O preview será entregue pelo webhook quando o usuário responder.
      const sendResult = await sendTemplateOnly(user.phone, 'weekly_report', user.user_id);
      if (!sendResult.success) {
        console.error(`❌ sendTemplateOnly failed for ${user.user_id}: ${sendResult.error}`);
        // Reverte trigger_sent_at para reprocessar depois
        await supabase
          .from('monthly_letters')
          .update({ trigger_sent_at: null })
          .eq('user_id', user.user_id)
          .eq('letter_month', letterMonth);
        failed++;
      } else {
        sent++;
        console.log(`✅ Template gatilho da Carta Mensal enviado para ${user.phone.substring(0, 4)}***`);
      }

      await new Promise(r => setTimeout(r, 400));
    } catch (e) {
      console.error(`❌ Erro processando user ${user.user_id}:`, e);
      failed++;
    }
  }

  const summary = { status: 'done', total: users?.length || 0, sent, skipped, failed, letter_month: letterMonth };
  console.log('📊 [generate-monthly-letter]', summary);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});