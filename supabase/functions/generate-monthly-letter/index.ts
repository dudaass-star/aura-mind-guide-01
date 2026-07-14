// ============================================================================
// generate-monthly-letter
// ----------------------------------------------------------------------------
// CRON: dia 1 de cada mês às 10h BRT (13h UTC).
// Para cada usuário ativo (status active|trial), consolida marcos + insights +
// sessões dos últimos 30 dias e gera uma carta personalizada via gemini-2.5-pro.
//
// Persiste em public.monthly_letters (letter_text + preview_text) e dispara o
// template gatilho 'carta_mensal' (Quick Reply) via sendTemplateOnly.
// O preview é entregue em texto livre pelo process-webhook-message quando o
// usuário clica no botão (abre janela de 24h).
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
  snapshots: SnapshotForLetter[];
  snapshots_confidence: 'high' | 'low' | 'insufficient_data' | 'none';
}

interface SnapshotForLetter {
  theme: string;
  before: string | null;
  change: string | null;
  quote: string | null;
  quote_date: string | null;
  confidence: 'high' | 'low';
}

async function gatherContext(supabase: any, userId: string, letterMonth: string): Promise<{
  milestones: string[];
  insights: string[];
  themes: string[];
  sessions_count: number;
  snapshots: SnapshotForLetter[];
  snapshots_confidence: 'high' | 'low' | 'insufficient_data' | 'none';
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

  // Snapshots temáticos do mês da carta (produzidos por generate-thematic-snapshots).
  const monthDate = new Date(letterMonth + 'T00:00:00Z');
  const prevMonthStart = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() - 1, 1))
    .toISOString().slice(0, 10);
  const { data: snapsRaw } = await supabase
    .from('thematic_snapshots')
    .select('theme, snapshot_before, snapshot_change, evidence_quote, evidence_date, confidence, period_start')
    .eq('user_id', userId)
    .in('period_start', [letterMonth, prevMonthStart])
    .order('period_start', { ascending: false });

  const snaps: SnapshotForLetter[] = [];
  let snapshots_confidence: 'high' | 'low' | 'insufficient_data' | 'none' = 'none';
  for (const s of (snapsRaw || [])) {
    if (s.confidence === 'insufficient_data') {
      if (snapshots_confidence === 'none') snapshots_confidence = 'insufficient_data';
      continue;
    }
    if (s.theme === '__month__') continue;
    snaps.push({
      theme: s.theme,
      before: s.snapshot_before,
      change: s.snapshot_change,
      quote: s.evidence_quote,
      quote_date: s.evidence_date,
      confidence: s.confidence as 'high' | 'low',
    });
    if (s.confidence === 'high') snapshots_confidence = 'high';
    else if (snapshots_confidence !== 'high') snapshots_confidence = 'low';
  }

  return {
    milestones: (milestonesRes.data || []).map((m: any) => m.milestone_text).filter(Boolean),
    insights: (insightsRes.data || []).map((i: any) => i.value).filter(Boolean),
    themes: (themesRes.data || []).map((t: any) => t.theme_name).filter(Boolean),
    sessions_count: sessionsRes.count || 0,
    snapshots: snaps.slice(0, 4),
    snapshots_confidence,
  };
}

async function generateLetter(ctx: UserContext): Promise<{ preview: string; letter: string } | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    console.error('❌ LOVABLE_API_KEY not configured');
    return null;
  }

  const firstName = ctx.name ? ctx.name.split(' ')[0] : 'você';

  const hasAnchors = ctx.snapshots.length > 0;
  const anchorRule = hasAnchors
    ? `\n\nÂNCORAS OBRIGATÓRIAS: use pelo menos UMA das citações literais listadas em "Snapshots temáticos" entre aspas, exatamente como foi escrita. Não parafraseie a citação.`
    : (ctx.snapshots_confidence === 'insufficient_data'
        ? `\n\nATENÇÃO: houve pouco material no mês. Escreva uma carta CURTA (150-220 palavras) reconhecendo o silêncio, sem inventar arco nem citar frases.`
        : '');

  const systemPrompt = `Você é a AURA, mentora terapêutica brasileira. Está escrevendo uma CARTA MENSAL pessoal para ${firstName}.

Tom: caloroso, direto, sem clichês de coach. Português brasileiro informal (tô, né). Sem emojis.
Estrutura da CARTA (300-450 palavras):
1. Abertura curta reconhecendo o mês que passou (sem floreios)
2. O que você observou: padrões, marcos, mudanças reais (cite específicos do contexto)
3. Uma reflexão honesta — pode ser desconfortável, é uma carta de mentora, não um abraço
4. Fechamento com uma pergunta provocativa para o próximo mês${anchorRule}

PREVIEW (1 frase, máx 200 chars): teaser provocativo que faz a pessoa querer ler a carta completa. NÃO resumir. Deve criar curiosidade.`;

  const snapshotsBlock = ctx.snapshots.length > 0
    ? '\n\nSnapshots temáticos (use como âncora, citações são LITERAIS do próprio usuário):\n' +
      ctx.snapshots.map(s => `- Tema: ${s.theme}${s.before ? ` | Onde estava: ${s.before}` : ''}${s.change ? ` | O que mudou: ${s.change}` : ''}${s.quote ? ` | Citação (${(s.quote_date || '').slice(0,10)}): "${s.quote}"` : ''} [confiança: ${s.confidence}]`).join('\n')
    : '';

  const userPrompt = `Contexto dos últimos 30 dias de ${firstName}:
- Sessões concluídas: ${ctx.sessions_count}
- Marcos registrados: ${ctx.milestones.length > 0 ? ctx.milestones.join(' | ') : 'nenhum'}
- Temas recorrentes: ${ctx.themes.length > 0 ? ctx.themes.join(', ') : 'nenhum'}
- Insights guardados: ${ctx.insights.length > 0 ? ctx.insights.slice(0, 6).join(' | ') : 'nenhum'}
- Tópico principal: ${ctx.primary_topic || 'não definido'}${snapshotsBlock}

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

      const ctx = await gatherContext(supabase, user.user_id, letterMonth);

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
        snapshots: ctx.snapshots,
        snapshots_confidence: ctx.snapshots_confidence,
      });

      if (!result) {
        failed++;
        continue;
      }

      // Disparar PRIMEIRO o template gatilho Quick Reply 'carta_mensal'.
      // Só persistimos se o envio do template foi bem-sucedido, e usamos o
      // instante real como trigger_sent_at (âncora da janela curta de entrega).
      const sendResult = await sendTemplateOnly(user.phone, 'monthly_letter', user.user_id);
      if (!sendResult.success) {
        console.error(`❌ sendTemplateOnly failed for ${user.user_id}: ${sendResult.error}`);
        failed++;
        continue;
      }

      const triggerSentIso = new Date().toISOString();
      const { error: insertErr } = await supabase
        .from('monthly_letters')
        .insert({
          user_id: user.user_id,
          letter_month: letterMonth,
          letter_text: result.letter,
          preview_text: result.preview,
          trigger_sent_at: triggerSentIso,
          // SID retornado pelo Twilio — usado pelo webhook para casar
          // o clique do botão (OriginalRepliedMessageSid) com este registro
          // de forma 100% determinística.
          trigger_message_sid: sendResult.messageId ?? null,
        });

      if (insertErr) {
        console.error(`❌ Insert monthly_letters failed for ${user.user_id}:`, insertErr.message);
        // template já foi enviado — não reverter para evitar reenvio amanhã
      }

      sent++;
      console.log(`✅ Template gatilho da Carta Mensal enviado para ${user.phone.substring(0, 4)}*** (preview entregue se clicar em até 30min)`);

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