// ============================================================================
// generate-thematic-snapshots
// ----------------------------------------------------------------------------
// CRON: dia 1 de cada mês. Consolida a jornada do MÊS ANTERIOR em snapshots
// por tema com citação LITERAL do usuário (substring exata em messages.content)
// e nível de confiança (high | low | insufficient_data).
// Body opcional: { user_id?, period_start?, period_end? } para backfill.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";

type Confidence = "high" | "low" | "insufficient_data";
interface ThemeCandidate { theme: string; mentions: number; }
interface UserMsg { id: string; content: string; created_at: string; }

function previousMonthWindow(now = new Date()) {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return {
    period_start: first.toISOString().slice(0, 10),
    period_end: last.toISOString().slice(0, 10),
    startIso: first.toISOString(),
    endIso: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
  };
}

async function collectThemes(supabase: any, userId: string, startIso: string, endIso: string): Promise<ThemeCandidate[]> {
  const { data: sessionThemes } = await supabase
    .from('session_themes')
    .select('theme_name, session_count')
    .eq('user_id', userId)
    .gte('last_mentioned_at', startIso)
    .lt('last_mentioned_at', endIso)
    .order('session_count', { ascending: false })
    .limit(10);

  const { data: insights } = await supabase
    .from('user_insights')
    .select('key, mentioned_count, category')
    .eq('user_id', userId)
    .gte('last_mentioned_at', startIso)
    .lt('last_mentioned_at', endIso)
    .in('category', ['pessoa', 'identidade', 'objetivo', 'crenca', 'emocao', 'trauma'])
    .order('mentioned_count', { ascending: false })
    .limit(10);

  const map = new Map<string, number>();
  for (const t of (sessionThemes || [])) {
    const name = String(t.theme_name || '').trim().toLowerCase();
    if (!name) continue;
    map.set(name, (map.get(name) || 0) + Number(t.session_count || 1) * 2);
  }
  for (const i of (insights || [])) {
    const name = String(i.key || '').trim().toLowerCase();
    if (!name) continue;
    map.set(name, (map.get(name) || 0) + Number(i.mentioned_count || 1));
  }
  return Array.from(map.entries())
    .map(([theme, mentions]) => ({ theme, mentions }))
    .sort((a, b) => b.mentions - a.mentions);
}

async function fetchUserMessages(supabase: any, userId: string, startIso: string, endIso: string): Promise<UserMsg[]> {
  const { data } = await supabase
    .from('messages')
    .select('id, content, created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: true })
    .limit(600);
  return (data || []).filter((m: any) => typeof m.content === 'string' && m.content.trim().length > 0);
}

async function fetchPreviousSnapshot(supabase: any, userId: string, theme: string, currentPeriodStart: string) {
  const { data } = await supabase
    .from('thematic_snapshots')
    .select('snapshot_before, snapshot_change, evidence_quote, period_start')
    .eq('user_id', userId)
    .eq('theme', theme)
    .lt('period_start', currentPeriodStart)
    .in('confidence', ['high', 'low'])
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

function relevantMessagesForTheme(theme: string, msgs: UserMsg[]): UserMsg[] {
  const needle = theme.toLowerCase();
  const hits = msgs.filter(m => m.content.toLowerCase().includes(needle));
  if (hits.length >= 8) return hits.slice(0, 40);
  const others = msgs
    .filter(m => !hits.includes(m))
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, 40 - hits.length);
  return [...hits, ...others];
}

async function generateSnapshot(
  theme: string,
  msgs: UserMsg[],
  previous: any,
  confidence: Confidence,
) {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return null;

  const previousBlock = previous
    ? `Snapshot anterior (${previous.period_start}):\n- Onde estava: ${previous.snapshot_before || '—'}\n- O que mudou: ${previous.snapshot_change || '—'}\n- Citação anterior: ${previous.evidence_quote ? `"${previous.evidence_quote}"` : '—'}`
    : 'Sem snapshot anterior — este é o primeiro recorte deste tema.';

  const msgBlock = msgs.map(m => `[${m.id}] (${m.created_at.slice(0,10)}) ${m.content.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n');

  const systemPrompt = `Você monta um snapshot mensal por tema sobre o próprio usuário, com base APENAS nas mensagens LITERAIS dele.
REGRAS DUROS:
- NUNCA invente citações. A "evidence_quote" DEVE ser substring exata copiada de UMA mensagem listada.
- "evidence_message_id" DEVE ser o [id] entre colchetes da mensagem de onde a citação foi copiada.
- Se não houver material honesto para o tema, retorne todos os campos como null.
- Português brasileiro seco, sem clichê terapêutico, sem emoji. Frases curtas.
- "before" (opcional, máx 200 chars): onde a pessoa estava no início do período.
- "change" (opcional, máx 200 chars): o que mudou/apareceu no período; null se nada mudou.
- Confiança: ${confidence}. Se 'low', seja mais cauteloso ou retorne null.`;

  const userPrompt = `Tema: ${theme}\n\n${previousBlock}\n\nMensagens do usuário no período:\n${msgBlock}`;

  try {
    const response = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'emit_snapshot',
            description: 'Emite o snapshot temático do usuário.',
            parameters: {
              type: 'object',
              properties: {
                before: { type: ['string', 'null'] },
                change: { type: ['string', 'null'] },
                evidence_message_id: { type: ['string', 'null'] },
                evidence_quote: { type: ['string', 'null'] },
              },
              required: ['before', 'change', 'evidence_message_id', 'evidence_quote'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'emit_snapshot' } },
      }),
    });
    if (!response.ok) {
      console.error(`AI Gateway ${response.status}: ${(await response.text()).slice(0, 200)}`);
      return null;
    }
    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return null;
    const args = JSON.parse(toolCall.function.arguments);
    return {
      before: args.before || null,
      change: args.change || null,
      evidence_message_id: args.evidence_message_id || null,
      evidence_quote: args.evidence_quote || null,
    };
  } catch (e) {
    console.error('generateSnapshot error:', e);
    return null;
  }
}

async function processUser(supabase: any, userId: string, w: ReturnType<typeof previousMonthWindow>) {
  const msgs = await fetchUserMessages(supabase, userId, w.startIso, w.endIso);
  const messageCount = msgs.length;

  if (messageCount < 10) {
    await supabase.from('thematic_snapshots').upsert({
      user_id: userId,
      theme: '__month__',
      period_start: w.period_start,
      period_end: w.period_end,
      message_count_in_period: messageCount,
      confidence: 'insufficient_data' as Confidence,
    }, { onConflict: 'user_id,theme,period_start' });
    return { wrote: 0, insufficient: true };
  }

  const themes = await collectThemes(supabase, userId, w.startIso, w.endIso);
  const eligible = themes.filter(t => t.mentions >= 5).slice(0, 4);
  if (eligible.length === 0) {
    await supabase.from('thematic_snapshots').upsert({
      user_id: userId,
      theme: '__month__',
      period_start: w.period_start,
      period_end: w.period_end,
      message_count_in_period: messageCount,
      confidence: 'insufficient_data' as Confidence,
    }, { onConflict: 'user_id,theme,period_start' });
    return { wrote: 0, insufficient: true };
  }

  const confidence: Confidence = messageCount >= 30 ? 'high' : 'low';
  const byId = new Map(msgs.map(m => [m.id, m]));
  let wrote = 0;

  for (const { theme } of eligible) {
    const themeMsgs = relevantMessagesForTheme(theme, msgs);
    if (themeMsgs.length < 3) continue;

    const previous = await fetchPreviousSnapshot(supabase, userId, theme, w.period_start);
    const gen = await generateSnapshot(theme, themeMsgs, previous, confidence);
    if (!gen) continue;

    let validQuote: string | null = null;
    let validMsgId: string | null = null;
    let validDate: string | null = null;
    if (gen.evidence_quote && gen.evidence_message_id) {
      const src = byId.get(gen.evidence_message_id);
      if (src && src.content.includes(gen.evidence_quote)) {
        validQuote = gen.evidence_quote;
        validMsgId = src.id;
        validDate = src.created_at;
      } else {
        console.warn(`⚠️ Citação inválida user=${userId} tema=${theme} — snapshot descartado`);
        continue;
      }
    }

    if (!validQuote && !gen.before && !gen.change) continue;

    const { error } = await supabase.from('thematic_snapshots').upsert({
      user_id: userId,
      theme,
      period_start: w.period_start,
      period_end: w.period_end,
      snapshot_before: gen.before,
      snapshot_change: gen.change,
      evidence_quote: validQuote,
      evidence_message_id: validMsgId,
      evidence_date: validDate,
      message_count_in_period: messageCount,
      confidence,
    }, { onConflict: 'user_id,theme,period_start' });

    if (error) {
      console.error(`upsert snapshot user=${userId} tema=${theme}:`, error.message);
      continue;
    }
    wrote++;
  }

  return { wrote, insufficient: false };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: any = {};
  try { body = await req.json(); } catch { /* cron sem body */ }

  const w = (body?.period_start && body?.period_end)
    ? {
        period_start: body.period_start as string,
        period_end: body.period_end as string,
        startIso: new Date(body.period_start + 'T00:00:00Z').toISOString(),
        endIso: new Date(new Date(body.period_end + 'T00:00:00Z').getTime() + 24 * 3600 * 1000).toISOString(),
      }
    : previousMonthWindow();

  console.log(`🗓️ [generate-thematic-snapshots] window=${w.period_start}..${w.period_end}`);

  let users: { user_id: string }[] = [];
  if (body?.user_id) {
    users = [{ user_id: body.user_id }];
  } else {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, status')
      .in('status', ['active', 'trial']);
    if (error) {
      console.error('fetch users:', error);
      return new Response(JSON.stringify({ error: 'fetch_users_failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    users = (data || []).map((u: any) => ({ user_id: u.user_id }));
  }

  console.log(`👥 ${users.length} usuários`);
  const results = { total: users.length, snapshots_written: 0, insufficient_users: 0, failed: 0 };
  for (const u of users) {
    try {
      const r = await processUser(supabase, u.user_id, w);
      results.snapshots_written += r.wrote;
      if (r.insufficient) results.insufficient_users++;
      await new Promise(res => setTimeout(res, 250));
    } catch (e) {
      console.error(`user ${u.user_id} failed:`, e);
      results.failed++;
    }
  }

  console.log('📊 [generate-thematic-snapshots]', results);
  return new Response(JSON.stringify({ status: 'done', ...results, window: { period_start: w.period_start, period_end: w.period_end } }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});