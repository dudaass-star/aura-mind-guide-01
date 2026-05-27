// Recuperação one-shot: envia mensagem de retomada contextual aos usuários
// que ficaram sem resposta por causa do bug Meta 131037 (26/05/2026).
//
// Para cada usuário "stuck":
// 1. Busca última mensagem do usuário em `messages`.
// 2. Gera UMA mensagem de retomada via Gemini Flash que referencia o
//    conteúdo da última mensagem.
// 3. Envia via Twilio (texto livre, janela 24h aberta).
// 4. Grava no `messages` e marca `failed_message_log` como resolved.
//
// Invocação manual: POST /recover-stuck-users  body: { dry_run?: boolean, only_user_id?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendFreeText } from "../_shared/whatsapp-official.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Momento em que a flag foi corrigida (UTC). Quem mandou msg depois disso
// já recebeu a Aura organicamente — não entra na lista.
const FIX_AT = '2026-05-27T01:19:27Z';

interface StuckUser {
  user_id: string;
  name: string | null;
  phone: string;
  last_user_at: string;
}

async function generateRecoveryMessage(
  apiKey: string,
  userName: string,
  lastUserMessage: string,
): Promise<string> {
  const firstName = (userName || '').split(' ')[0] || 'aí';

  const prompt = `Você é a Aura, mentora terapêutica (logoterapia, tom informal PT-BR, presente, honesta, sem dramatização).

CONTEXTO: ${firstName} te mandou uma mensagem há algumas horas e você NÃO respondeu por uma instabilidade técnica do WhatsApp (já resolvida agora). A última mensagem dela foi:

"${lastUserMessage}"

TAREFA: Escreva UMA mensagem de retomada (máximo 3 bubbles, separadas por |||) que:

1. Reconheça brevemente que demorou (uma frase, sem dramatizar nem se desculpar de joelhos — algo como "ei, demorei aqui" ou "voltei").
2. Mostre que você LEU o que ela disse, referenciando o conteúdo específico — pegue o ponto principal da mensagem dela e devolva algo concreto sobre ele.
3. Continue o fio de forma natural — uma pergunta ou observação que dê seguimento ao que ela trouxe. NUNCA use "como você tá?" genérico.

Regras:
- Informal, sem emoji excessivo (no máx 1 se fizer sentido).
- Bubbles curtas, separadas por |||.
- Sem preâmbulo técnico ("tive uma falha no sistema..."). Resolva isso em poucas palavras humanas.
- Não invente fatos que ela não disse.
- Responda APENAS o texto da mensagem (com os |||). Sem aspas, sem explicação.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI Gateway ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('AI returned empty content');
  return text;
}

function isQuietHoursBRT(): boolean {
  // BRT = UTC-3. Silent 22h–08h BRT = 01h–11h UTC.
  const utcHour = new Date().getUTCHours();
  return utcHour >= 1 && utcHour < 11;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dry_run === true;
    const onlyUserId: string | undefined = body.only_user_id;
    const ignoreQuiet: boolean = body.ignore_quiet_hours === true;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');

    if (!ignoreQuiet && !dryRun && isQuietHoursBRT()) {
      return new Response(JSON.stringify({
        status: 'skipped_quiet_hours',
        message: 'Dentro da janela silenciosa 22h–08h BRT. Reenvie depois das 08h BRT ou passe ignore_quiet_hours=true.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 1. Lista de stuck users
    const { data: stuck, error: stuckErr } = await supabase.rpc('exec', {}).then(
      async () => {
        // fallback: query direto via from() não funciona pra CTE; vamos usar duas queries
        return { data: null, error: null };
      },
    ).catch(() => ({ data: null, error: null })) as { data: unknown; error: unknown };

    // Query manual (sem rpc): pegar user_ids com falha 131037 antes do fix,
    // cuja última mensagem do usuário também é anterior ao fix.
    const { data: failedRows, error: failedErr } = await supabase
      .from('failed_message_log')
      .select('user_id')
      .lt('created_at', FIX_AT)
      .gte('created_at', '2026-05-26T00:00:00Z')
      .like('error', '%131037%')
      .not('user_id', 'is', null);

    if (failedErr) throw failedErr;

    const uniqueUserIds = Array.from(new Set((failedRows ?? []).map((r: { user_id: string }) => r.user_id)));
    if (uniqueUserIds.length === 0) {
      return new Response(JSON.stringify({ status: 'no_failed_users' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetIds = onlyUserId ? uniqueUserIds.filter((id) => id === onlyUserId) : uniqueUserIds;

    // 2. Para cada user_id: pegar perfil + última msg do usuário
    const stuckUsers: StuckUser[] = [];
    for (const uid of targetIds) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('user_id', uid)
        .single();
      if (!profile?.phone) continue;

      const { data: lastMsg } = await supabase
        .from('messages')
        .select('content, created_at')
        .eq('user_id', uid)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastMsg) continue;
      // Se a última msg do usuário é POSTERIOR ao fix, ele já conversou — pular.
      if (new Date(lastMsg.created_at) >= new Date(FIX_AT)) continue;

      stuckUsers.push({
        user_id: uid,
        name: profile.name,
        phone: profile.phone,
        last_user_at: lastMsg.created_at,
      });
    }

    console.log(`📋 [Recovery] ${stuckUsers.length} stuck users to recover (dry_run=${dryRun})`);

    const results: Array<Record<string, unknown>> = [];
    let sent = 0;
    let failed = 0;

    for (const u of stuckUsers) {
      try {
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('content')
          .eq('user_id', u.user_id)
          .eq('role', 'user')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const recoveryText = await generateRecoveryMessage(apiKey, u.name ?? '', lastMsg!.content);

        if (dryRun) {
          results.push({ user_id: u.user_id, name: u.name, preview: recoveryText });
          continue;
        }

        // Envia cada bubble separada (split por |||)
        const bubbles = recoveryText.split('|||').map((b) => b.trim()).filter(Boolean);
        let allOk = true;
        for (let i = 0; i < bubbles.length; i++) {
          const res = await sendFreeText(u.phone, bubbles[i]);
          if (!res.success) {
            allOk = false;
            await supabase.from('failed_message_log').insert({
              user_id: u.user_id, phone: u.phone, content: bubbles[i],
              function_name: 'recover-stuck-users', error: res.error ?? 'unknown',
            });
            break;
          }
          await supabase.from('messages').insert({
            user_id: u.user_id, role: 'assistant', content: bubbles[i],
          });
          if (i < bubbles.length - 1) await new Promise((r) => setTimeout(r, 1500));
        }

        if (allOk) {
          sent++;
          await supabase
            .from('failed_message_log')
            .update({ resolved: true })
            .eq('user_id', u.user_id)
            .like('error', '%131037%')
            .eq('resolved', false);
          results.push({ user_id: u.user_id, name: u.name, status: 'sent', bubbles: bubbles.length });
        } else {
          failed++;
          results.push({ user_id: u.user_id, name: u.name, status: 'failed' });
        }

        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ [Recovery] ${u.user_id} (${u.name}): ${msg}`);
        results.push({ user_id: u.user_id, name: u.name, status: 'error', error: msg });
      }
    }

    return new Response(JSON.stringify({
      status: 'done', total: stuckUsers.length, sent, failed, dry_run: dryRun, results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ [Recovery] fatal:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
