// ============================================================================
// curate-monthly-milestones
// ----------------------------------------------------------------------------
// CRON: dia 1 de cada mês, 6h BRT (9h UTC).
// Para cada usuário ativo, escaneia mensagens dos últimos 30 dias buscando
// até 2 marcos retroativos que escaparam da detecção em tempo real.
// Insere em user_milestones com source='monthly_curation'.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function curateUserMilestones(
  supabase: any,
  userId: string,
  userName: string | null,
): Promise<number> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return 0;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Buscar últimas mensagens do mês
  const { data: messages } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: true })
    .limit(500);

  if (!messages || messages.length < 8) return 0; // pouca conversa, skip

  // Marcos já existentes do período (evitar duplicidade)
  const { data: existingMarcos } = await supabase
    .from('user_milestones')
    .select('milestone_text')
    .eq('user_id', userId)
    .gte('milestone_date', thirtyDaysAgo);

  const existingTexts = (existingMarcos || []).map((m: any) => (m.milestone_text || '').toLowerCase());

  // Compactar conversa
  const conversation = messages
    .map((m: any) => `${m.role === 'user' ? 'USUÁRIO' : 'AURA'}: ${String(m.content || '').substring(0, 400)}`)
    .join('\n')
    .substring(0, 30000);

  const systemPrompt = `Você é um curador editorial. Analisa conversas terapêuticas e identifica MARCOS — momentos de virada genuínos.

Marco é: percepção que muda como a pessoa vê algo, decisão importante, quebra de padrão, primeira vez nomeando algo difícil.
Marco NÃO é: desabafo comum, queixa, factual, ping-pong.

Retorne 0 a 2 marcos do mês. Se não houver virada genuína, retorne lista VAZIA.
Cada marco: frase curta em segunda pessoa do singular ("você"), passado, máx 200 chars, tom biográfico.`;

  const userPrompt = `Conversa do último mês de ${userName || 'usuário'}:

${conversation}

Marcos já registrados (NÃO repita):
${existingTexts.length ? existingTexts.map((t: string) => `- ${t}`).join('\n') : '(nenhum)'}

Identifique os marcos retroativos.`;

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
            name: 'emit_milestones',
            description: 'Emite até 2 marcos do mês. Lista vazia se não houver.',
            parameters: {
              type: 'object',
              properties: {
                milestones: {
                  type: 'array',
                  maxItems: 2,
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string', description: 'Frase do marco, máx 200 chars' },
                      excerpt: { type: 'string', description: 'Trecho da conversa que gerou (opcional)' },
                    },
                    required: ['text'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['milestones'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'emit_milestones' } },
      }),
    });

    if (!resp.ok) {
      console.error(`❌ AI ${resp.status} for user ${userId}:`, (await resp.text()).substring(0, 200));
      return 0;
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return 0;
    const args = JSON.parse(toolCall.function.arguments);
    const milestones = Array.isArray(args.milestones) ? args.milestones : [];

    let inserted = 0;
    for (const m of milestones) {
      const text = String(m.text || '').trim().substring(0, 200);
      if (text.length < 10) continue;
      if (existingTexts.includes(text.toLowerCase())) continue;

      const { error } = await supabase.from('user_milestones').insert({
        user_id: userId,
        milestone_text: text,
        milestone_date: new Date().toISOString(),
        source: 'monthly_curation',
        context_excerpt: m.excerpt ? String(m.excerpt).substring(0, 500) : null,
      });
      if (!error) inserted++;
    }
    return inserted;
  } catch (e) {
    console.error(`❌ Curate exception user ${userId}:`, e);
    return 0;
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

  console.log('🗓️ [curate-monthly-milestones] starting');

  const { data: users } = await supabase
    .from('profiles')
    .select('user_id, name, status')
    .in('status', ['active', 'trial']);

  let processed = 0, totalMilestones = 0;

  for (const user of users || []) {
    try {
      const inserted = await curateUserMilestones(supabase, user.user_id, user.name);
      totalMilestones += inserted;
      processed++;
      if (inserted > 0) console.log(`✨ ${inserted} marco(s) curado(s) para ${user.user_id}`);
      await new Promise(r => setTimeout(r, 400));
    } catch (e) {
      console.error(`❌ Erro processando ${user.user_id}:`, e);
    }
  }

  const summary = { status: 'done', processed, totalMilestones };
  console.log('📊 [curate-monthly-milestones]', summary);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});