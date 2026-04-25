// ============================================================================
// send-weekly-question
// ----------------------------------------------------------------------------
// CRON: toda terça às 9h BRT (12h UTC).
// Para cada usuário ativo (status active|trial), gera UMA pergunta provocativa
// contextual via Lovable AI Gateway (gemini-2.5-flash), persiste em
// public.weekly_questions e envia via WhatsApp (sendProactive).
//
// Idempotência: skip se já existe weekly_questions(user_id, question_date=hoje).
// Respeita do_not_disturb_until.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendProactive } from "../_shared/whatsapp-provider.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface UserContext {
  user_id: string;
  name: string | null;
  phone: string;
  recent_themes: string[];
  recent_insights: string[];
  open_commitments: string[];
  primary_topic: string | null;
}

async function gatherContext(supabase: any, userId: string): Promise<{
  themes: string[];
  insights: string[];
  commitments: string[];
}> {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [themesRes, sessionsRes, commitmentsRes] = await Promise.all([
    supabase
      .from('session_themes')
      .select('theme_name, session_count')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('last_mentioned_at', twoWeeksAgo)
      .order('session_count', { ascending: false })
      .limit(3),
    supabase
      .from('sessions')
      .select('key_insights, focus_topic')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(3),
    supabase
      .from('commitments')
      .select('title')
      .eq('user_id', userId)
      .eq('completed', false)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  const themes = (themesRes.data || []).map((t: any) => t.theme_name).filter(Boolean);
  const insights: string[] = [];
  for (const s of (sessionsRes.data || [])) {
    if (Array.isArray(s.key_insights)) {
      for (const ins of s.key_insights) {
        if (typeof ins === 'string') insights.push(ins);
        else if (ins?.content) insights.push(String(ins.content));
        else if (ins?.text) insights.push(String(ins.text));
      }
    }
    if (s.focus_topic && !themes.includes(s.focus_topic)) themes.push(s.focus_topic);
  }
  const commitments = (commitmentsRes.data || []).map((c: any) => c.title).filter(Boolean);

  return {
    themes: themes.slice(0, 5),
    insights: insights.slice(0, 5),
    commitments: commitments.slice(0, 3),
  };
}

async function generateQuestion(ctx: UserContext): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.error('❌ LOVABLE_API_KEY missing');
    return null;
  }

  const contextLines: string[] = [];
  if (ctx.recent_themes.length) contextLines.push(`Temas recentes: ${ctx.recent_themes.join(', ')}`);
  if (ctx.recent_insights.length) contextLines.push(`Insights recentes: ${ctx.recent_insights.slice(0, 3).join(' | ')}`);
  if (ctx.open_commitments.length) contextLines.push(`Compromissos abertos: ${ctx.open_commitments.join(', ')}`);
  if (ctx.primary_topic) contextLines.push(`Tópico principal: ${ctx.primary_topic}`);

  const contextBlock = contextLines.length
    ? contextLines.join('\n')
    : 'Sem contexto recente — usuário em fase inicial.';

  const systemPrompt = `Você é a Aura, mentora terapêutica em português brasileiro.
Sua tarefa: gerar UMA única pergunta provocativa, afetiva, em segunda pessoa do singular ("você"), com NO MÁXIMO 25 palavras.

REGRAS:
- A pergunta deve abrir um fio que a pessoa vai querer puxar — algo que ela anda evitando, contornando ou não percebendo.
- Tom: direto, íntimo, sem rodeios. Sem disclaimers.
- NÃO use construções genéricas tipo "você acha que...", "como você se sente sobre...".
- NÃO mencione terapia, sessão, jornada explicitamente.
- Use o contexto do usuário para personalizar — não seja vaga.
- Se não houver contexto, faça pergunta universal mas afiada (ex: identidade, autoengano, evitação).
- Retorne APENAS via tool calling.`;

  const userPrompt = `Contexto do usuário ${ctx.name || ''}:
${contextBlock}

Gere a pergunta da semana.`;

  try {
    const resp = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'emit_weekly_question',
            description: 'Emite a pergunta da semana, máx 25 palavras, segunda pessoa.',
            parameters: {
              type: 'object',
              properties: {
                question: { type: 'string', description: 'A pergunta única, máx 25 palavras' },
              },
              required: ['question'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'emit_weekly_question' } },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`❌ AI Gateway error ${resp.status}:`, errText.substring(0, 300));
      return null;
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error('❌ No tool_call in AI response');
      return null;
    }
    const args = JSON.parse(toolCall.function.arguments);
    const question = String(args.question || '').trim();
    if (!question || question.length < 8 || question.length > 280) {
      console.warn(`⚠️ Pergunta inválida (len=${question.length}): "${question}"`);
      return null;
    }
    return question;
  } catch (e) {
    console.error('❌ generateQuestion exception:', e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  console.log('📅 [send-weekly-question] starting batch run');

  const today = new Date();
  const todayDateStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
  const nowIso = today.toISOString();

  // Buscar usuários ativos
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
      // Respeita DND
      if (user.do_not_disturb_until && new Date(user.do_not_disturb_until) > today) {
        skipped++;
        continue;
      }

      // Skip se já existe pergunta hoje
      const { data: existing } = await supabase
        .from('weekly_questions')
        .select('id')
        .eq('user_id', user.user_id)
        .eq('question_date', todayDateStr)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Coletar contexto
      const { themes, insights, commitments } = await gatherContext(supabase, user.user_id);

      const question = await generateQuestion({
        user_id: user.user_id,
        name: user.name,
        phone: user.phone,
        recent_themes: themes,
        recent_insights: insights,
        open_commitments: commitments,
        primary_topic: user.primary_topic,
      });

      if (!question) {
        failed++;
        continue;
      }

      // Persistir antes do envio (assim a captura de resposta no webhook tem registro)
      const { error: insertErr } = await supabase
        .from('weekly_questions')
        .insert({
          user_id: user.user_id,
          question_text: question,
          question_date: todayDateStr,
          sent_at: nowIso,
        });

      if (insertErr) {
        console.error(`❌ Insert weekly_questions failed for ${user.user_id}:`, insertErr.message);
        failed++;
        continue;
      }

      // Enviar via WhatsApp
      const result = await sendProactive(user.phone, question, 'checkin', user.user_id);
      if (!result.success) {
        console.error(`❌ sendProactive failed for ${user.user_id}: ${result.error}`);
        failed++;
      } else {
        sent++;
        console.log(`✅ Pergunta enviada para ${user.phone.substring(0, 4)}***`);
      }

      // Anti-burst
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.error(`❌ Erro processando user ${user.user_id}:`, e);
      failed++;
    }
  }

  const summary = { status: 'done', total: users?.length || 0, sent, skipped, failed };
  console.log('📊 [send-weekly-question]', summary);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});