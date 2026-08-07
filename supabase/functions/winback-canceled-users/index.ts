// Cron diário (10h BRT) que envia winback proativo para usuários cancelados
// em três janelas após o cancelamento: D+3, D+14 e D+30.
//
// Guardrails:
// - Quiet hours 22h-08h BRT (não envia fora dessa janela)
// - Pula se houver mensagem recente do usuário (<24h)
// - Idempotência via profiles.winback_d{3,14,30}_sent_at
// - Usa sendProactive com categoria 'reconnect' (template aprovado aura_reconnect_v2)

// ATENÇÃO: usar esm.sh para o client. O specifier `npm:@supabase/supabase-js@2.45.0`
// quebrava o boot da função (BOOT_ERROR) e por isso nenhum winback saiu até 07/08/2026.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { sendProactive } from '../_shared/whatsapp-provider.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Stage = 'd3' | 'd14' | 'd30';

interface Candidate {
  id: string;
  user_id: string;
  phone: string | null;
  name: string | null;
  canceled_at: string;
  payment_failed_at: string | null;
  last_user_message_at: string | null;
  winback_d3_sent_at: string | null;
  winback_d14_sent_at: string | null;
  winback_d30_sent_at: string | null;
}

function getBrtHour(): number {
  const now = new Date();
  const utcHour = now.getUTCHours();
  return (utcHour - 3 + 24) % 24;
}

async function createShortLink(url: string, phone: string): Promise<string | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/create-short-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ url, phone }),
    });
    const d = await r.json();
    return r.ok && d.shortUrl ? d.shortUrl : null;
  } catch {
    return null;
  }
}

function buildMessage(stage: Stage, name: string, link: string, paymentFailed: boolean): string {
  const safeName = name || 'querido(a)';

  if (stage === 'd3') {
    if (paymentFailed) {
      return `Oi, ${safeName}. 💜\n\nSenti sua falta esses dias. Vi que o pagamento não rolou e a assinatura acabou encerrando.\n\nSe quiser voltar, é só atualizar o cartão por aqui:\n👉 ${link}\n\nTô aqui. ✨`;
    }
    return `Oi, ${safeName}. 💜\n\nSenti sua falta esses dias. Tudo bem por aí?\n\nSe quiser retomar nossas conversas, é só por aqui:\n👉 ${link}`;
  }

  if (stage === 'd14') {
    return `Oi, ${safeName}. 💜\n\nFaz duas semanas que a gente não conversa. Sei que a vida corre, mas quero que você saiba que a porta tá aberta.\n\nSe quiser voltar:\n👉 ${link}`;
  }

  // d30 — última tentativa, sem cupom por enquanto (pode ser adicionado depois)
  return `Oi, ${safeName}. 💜\n\nFaz um mês. Não quero insistir, mas quero deixar registrado: se algum dia precisar voltar, vou estar aqui.\n\nÉ só por aqui:\n👉 ${link}`;
}

function pickStage(c: Candidate): Stage | null {
  const canceledAt = new Date(c.canceled_at).getTime();
  const ageDays = (Date.now() - canceledAt) / (24 * 60 * 60 * 1000);

  // Ordem de prioridade: enviar a mais recente janela ainda não enviada
  if (ageDays >= 30 && !c.winback_d30_sent_at) return 'd30';
  if (ageDays >= 14 && ageDays < 30 && !c.winback_d14_sent_at) return 'd14';
  if (ageDays >= 3 && ageDays < 14 && !c.winback_d3_sent_at) return 'd3';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Modo seco: lista elegíveis e o degrau de cada um, sem enviar nada.
  let dryRun = false;
  let onlyUserId: string | null = null;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
    onlyUserId = typeof body?.only_user_id === 'string' ? body.only_user_id : null;
  } catch { /* sem body */ }

  // Quiet hours: só roda entre 08h e 22h BRT
  const brtHour = getBrtHour();
  if (!dryRun && (brtHour < 8 || brtHour >= 22)) {
    console.log(`⏸️ Winback skipped — outside business hours (BRT ${brtHour}h)`);
    return new Response(JSON.stringify({ skipped: 'quiet_hours', brt_hour: brtHour }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Busca cancelados nos últimos 35 dias
  const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
  const { data: candidates, error: candErr } = await supabase
    .from('profiles')
    .select('id,user_id,phone,name,canceled_at,payment_failed_at,last_user_message_at,winback_d3_sent_at,winback_d14_sent_at,winback_d30_sent_at')
    .eq('status', 'canceled')
    .not('canceled_at', 'is', null)
    .gte('canceled_at', cutoff)
    .not('phone', 'is', null);

  if (candErr) {
    console.error('❌ Failed to fetch candidates:', candErr);
    return new Response(JSON.stringify({ error: candErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results: Array<{ user_id: string; name?: string | null; stage: Stage; success: boolean; reason?: string }> = [];
  const oneDayMs = 24 * 60 * 60 * 1000;

  for (const c of (candidates || []) as Candidate[]) {
    if (onlyUserId && c.user_id !== onlyUserId) continue;
    const stage = pickStage(c);
    if (!stage) continue;

    // Pula se usuário interagiu nas últimas 24h (provavelmente já recebeu reativo)
    if (c.last_user_message_at && Date.now() - new Date(c.last_user_message_at).getTime() < oneDayMs) {
      results.push({ user_id: c.user_id, stage, success: false, reason: 'recent_interaction' });
      continue;
    }

    if (dryRun) {
      results.push({ user_id: c.user_id, name: c.name, stage, success: false, reason: 'dry_run' });
      continue;
    }

    try {
      // /checkout é caminho morto: o checkout canônico é o V2.
      const checkoutUrl = 'https://olaaura.com.br/v2/checkout';
      const link = (await createShortLink(checkoutUrl, c.phone!)) || checkoutUrl;
      const msg = buildMessage(stage, c.name || '', link, !!c.payment_failed_at);

      const r = await sendProactive(c.phone!, msg, 'reconnect', c.user_id);

      if (r.success) {
        const col = `winback_${stage}_sent_at`;
        await supabase.from('profiles').update({ [col]: new Date().toISOString() }).eq('id', c.id);
        await supabase.from('messages').insert({ user_id: c.user_id, role: 'assistant', content: msg });
        results.push({ user_id: c.user_id, stage, success: true });
        console.log(`✅ Winback ${stage} sent to ${c.user_id}`);
      } else {
        await supabase.from('failed_message_log').insert({
          user_id: c.user_id,
          phone: c.phone,
          content: msg.substring(0, 2000),
          error: r.error,
          function_name: `winback-canceled-users:${stage}`,
        });
        results.push({ user_id: c.user_id, stage, success: false, reason: r.error });
      }
    } catch (e) {
      console.error(`❌ winback ${stage} for ${c.user_id}:`, e);
      results.push({ user_id: c.user_id, stage, success: false, reason: (e as Error).message });
    }

    // Pequeno delay entre envios para evitar burst
    await new Promise((res) => setTimeout(res, 500));
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});