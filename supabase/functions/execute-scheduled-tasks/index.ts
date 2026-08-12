import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { sendMessage, sendAudio, sendProactive } from "../_shared/whatsapp-provider.ts";
import { getInstanceConfigForUser } from "../_shared/instance-helper.ts";
import { sendDunningWhatsApp } from "../_shared/dunning-whatsapp.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Recuperação do PIX Automático (Woovi): utilitários
//
// Cada tentativa vira UMA linha em woovi_charges (antes só sobrescrevia o
// last_error do mandato, o que deixava a régua cega sobre em que volta está).
// ─────────────────────────────────────────────────────────────────────────────
async function logWooviAttempt(
  supabase: any,
  a: {
    subscriptionId: string;
    userId: string | null;
    installmentId: string;
    label: string;
    ok: boolean;
    status: string;
    valueCents: number;
    dueDate: string | null;
    raw: string;
  },
) {
  try {
    const { count } = await supabase.from('woovi_charges')
      .select('id', { count: 'exact', head: true })
      .eq('subscription_id', a.subscriptionId);
    const { error: logErr } = await supabase.from('woovi_charges').insert({
      subscription_id: a.subscriptionId,
      // Sufixo evita colidir com a linha do ciclo (lookups usam maybeSingle).
      installment_id: `${a.installmentId}:${a.label}:${Date.now()}`,
      user_id: a.userId,
      cycle_index: Number(count || 0),
      // value_cents é NOT NULL: 0 em vez de null para não perder a tentativa.
      value_cents: Number(a.valueCents || 0),
      due_date: a.dueDate,
      status: a.status,
      kind: 'recovery_attempt',
      raw_payload: { label: a.label, ok: a.ok, response: a.raw?.slice(0, 1500) ?? null },
    });
    if (logErr) console.error('[woovi] insert da tentativa recusado:', logErr.message);
    await supabase.from('woovi_subscriptions')
      .update({ last_error: `${a.label}: ${a.status}` })
      .eq('subscription_id', a.subscriptionId);
  } catch (e) {
    console.error('[woovi] falha logando tentativa:', (e as Error).message);
  }
}

/** Encerra toda a cadência de recuperação (usado quando o cliente regulariza). */
async function cancelWooviRecovery(supabase: any, subscriptionId: string) {
  await supabase.from('scheduled_tasks')
    .update({ status: 'canceled', executed_at: new Date().toISOString() })
    .in('task_type', ['woovi_cycle_recycle', 'woovi_next_cycle_cobr', 'woovi_recovery_offer', 'woovi_recovery_final'])
    .eq('status', 'pending')
    .contains('payload', { subscription_id: subscriptionId });
}

// Tarefas puramente técnicas: elas COBRAM, não falam com o cliente. Não podem
// ser abortadas por falta de telefone no perfil, senão a assinatura morre sem
// nenhuma tentativa de débito.
const PHONELESS_TASK_TYPES = new Set([
  'woovi_cycle_recycle',
  'woovi_next_cycle_cobr',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Reescreve um texto de lembrete que foi gravado N dias atrás para a data de
// hoje (BRT). Resolve o bug clássico: lembrete criado ontem com "amanhã às 11h"
// é disparado hoje e o usuário lê "amanhã" no dia errado.
//
// Estratégia:
//   1. Se o texto NÃO contém expressões relativas a dia, devolve igual.
//   2. Se contém ("amanhã", "hoje", "ontem", dias da semana), pede pro Gemini
//      Flash-Lite reescrever curto, mantendo o mesmo conteúdo, mas usando
//      "hoje" como referência. Fallback silencioso pro texto original.
// ─────────────────────────────────────────────────────────────────────────────
const RELATIVE_DAY_REGEX = /\b(amanh[ãa]|hoje|ontem|depois\s+de\s+amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)\b/i;

async function rewriteReminderForToday(originalText: string, createdAtIso: string): Promise<string> {
  try {
    if (!originalText) return originalText;
    if (!RELATIVE_DAY_REGEX.test(originalText)) return originalText;

    // Só reescreve se o lembrete foi criado em outro dia BRT (senão "amanhã" pode estar correto)
    const createdDateBrt = new Date(new Date(createdAtIso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const todayBrt = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    if (createdDateBrt === todayBrt) return originalText;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return originalText;

    const nowBrt = new Date(Date.now() - 3 * 3600 * 1000);
    const weekdayNames = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
    const weekday = weekdayNames[nowBrt.getUTCDay()];
    const dateStr = `${String(nowBrt.getUTCDate()).padStart(2,'0')}/${String(nowBrt.getUTCMonth()+1).padStart(2,'0')}`;

    const systemPrompt = `Você reescreve lembretes curtos do WhatsApp para que façam sentido HOJE.
Regras:
- HOJE é ${weekday}, ${dateStr} (BRT).
- Reescreva mantendo conteúdo, tom e tamanho originais.
- Substitua expressões relativas (amanhã/ontem/dia da semana) pela referência correta a partir de HOJE.
- Se o lembrete originalmente dizia "amanhã" e amanhã é HOJE, use "hoje".
- Não invente fatos. Não adicione perguntas novas. Não use mais de 2 frases.
- Responda APENAS o texto reescrito, sem aspas, sem prefixo.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Lembrete original (criado em ${createdDateBrt} BRT):\n"${originalText}"` },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!aiResp.ok) return originalText;
    const json = await aiResp.json();
    const rewritten = (json?.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "");
    if (!rewritten || rewritten.length > originalText.length * 2.5) return originalText;
    console.log(`📝 Reminder rewritten for today: "${originalText.slice(0,60)}" → "${rewritten.slice(0,60)}"`);
    return rewritten;
  } catch (e) {
    console.warn("⚠️ rewriteReminderForToday falhou, usando texto original:", (e as Error).message);
    return originalText;
  }
}

// Helper to create short links for checkout URLs
async function createShortLink(url: string, phone: string): Promise<string> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-short-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ url, phone }),
    });
    const data = await response.json();
    if (response.ok && data.shortUrl) return data.shortUrl;
  } catch { /* fallback */ }
  return url; // fallback to original URL
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('⏰ [CRON] execute-scheduled-tasks starting...');

    // ========================================================================
    // SAFETY NET: Reset tasks stuck in 'executing' for >10 minutes
    // ========================================================================
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: stuckTasks } = await supabase
      .from('scheduled_tasks')
      .update({ status: 'pending' })
      .eq('status', 'executing')
      .lt('created_at', tenMinutesAgo)
      .select('id');

    if (stuckTasks && stuckTasks.length > 0) {
      console.log(`🔄 Reset ${stuckTasks.length} stuck tasks back to pending`);
    }

    // ========================================================================
    // CLAIM TASKS atomically with FOR UPDATE SKIP LOCKED
    // ========================================================================
    const { data: tasks, error: claimError } = await supabase
      .rpc('claim_pending_tasks', { max_tasks: 150 });

    if (claimError) {
      console.error('❌ Error claiming tasks:', claimError);
      return new Response(JSON.stringify({ error: 'Failed to claim tasks' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!tasks || tasks.length === 0) {
      console.log('✅ No pending tasks to execute');
      return new Response(JSON.stringify({ status: 'no_tasks', count: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📋 Claimed ${tasks.length} tasks for execution`);

    let executed = 0;
    let failed = 0;

    // ========================================================================
    // PROCESS TASKS with 300ms anti-burst delay
    // ========================================================================
    for (const task of tasks) {
      try {
        console.log(`🔧 Processing task ${task.id}: type=${task.task_type}, user=${task.user_id}`);

        // Get user profile for phone and instance config
        const { data: profile } = await supabase
          .from('profiles')
          .select('phone, name, whatsapp_instance_id')
          .eq('user_id', task.user_id)
          .maybeSingle();

        if (!profile?.phone) {
          console.warn(`⚠️ No phone found for user ${task.user_id}, marking as failed`);
          await supabase
            .from('scheduled_tasks')
            .update({ status: 'failed', executed_at: new Date().toISOString() })
            .eq('id', task.id);
          failed++;
          continue;
        }

        let instanceConfig = undefined;
        try {
          instanceConfig = await getInstanceConfigForUser(supabase, task.user_id);
        } catch (e) {
          console.warn('⚠️ Could not get instance config, using env vars');
        }

        const payload = task.payload as Record<string, any>;

        // ====================================================================
        // TASK TYPE HANDLERS
        // ====================================================================
        switch (task.task_type) {
          case 'reminder': {
            const rawText = payload.text || 'Ei, aqui é a Aura! Você me pediu pra te lembrar disso 💜';
            const reminderText = await rewriteReminderForToday(rawText, task.created_at);
            await sendProactive(profile.phone, reminderText, 'checkin', task.user_id);
            console.log(`✅ Reminder sent to ${profile.phone.substring(0, 4)}***`);
            break;
          }

          case 'meditation': {
            const meditationRes = await fetch(`${supabaseUrl}/functions/v1/send-meditation`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                category: payload.category || 'respiracao',
                user_id: task.user_id,
                phone: profile.phone,
                context: 'scheduled-task',
              }),
              signal: AbortSignal.timeout(15000),
            });
            if (!meditationRes.ok) {
              throw new Error(`send-meditation failed: ${await meditationRes.text()}`);
            }
            console.log(`✅ Meditation sent to ${profile.phone.substring(0, 4)}***`);
            break;
          }

          case 'message': {
            const rawMessageText = payload.text || '';
            if (rawMessageText) {
              const messageText = await rewriteReminderForToday(rawMessageText, task.created_at);
              await sendProactive(profile.phone, messageText, 'checkin', task.user_id);
              console.log(`✅ Scheduled message sent to ${profile.phone.substring(0, 4)}***`);
            }
            break;
          }


          case 'trial_insight': {
            const insightRes = await fetch(`${supabaseUrl}/functions/v1/deliver-trial-insight`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                user_id: task.user_id,
                scheduled_at: payload.scheduled_at,
              }),
              signal: AbortSignal.timeout(45000),
            });
            if (!insightRes.ok) {
              throw new Error(`deliver-trial-insight failed: ${await insightRes.text()}`);
            }
            const insightData = await insightRes.json();
            console.log(`✅ Trial insight result for ${profile.phone.substring(0, 4)}***: ${insightData.status}`);
            break;
          }

          case 'installment_renewal_reminder': {
            // Lembrete D-3 antes do fim do ciclo pago via cartão parcelado Asaas.
            // Só dispara se o usuário AINDA está active (senão vira dunning normal).
            const { data: fullProfile } = await supabase
              .from('profiles')
              .select('status, plan, plan_expires_at, email, name')
              .eq('user_id', task.user_id)
              .maybeSingle();
            if (!fullProfile || fullProfile.status !== 'active') {
              console.log('ℹ️ Installment reminder skipped (profile inativo ou removido)');
              break;
            }
            const firstName = (fullProfile.name || payload.customer_name || 'oi').split(' ')[0];
            const portalUrl = 'https://olaaura.com.br/meu-espaco';
            const waText = `Oi, ${firstName}! Sua assinatura da Aura vence em 3 dias. Pra continuar sem interrupção, renove em ${portalUrl} 💜`;
            try {
              await sendProactive(profile.phone, waText, 'checkin', task.user_id);
              console.log(`✅ Installment renewal reminder (WhatsApp) enviado para ${profile.phone.substring(0, 4)}***`);
            } catch (waErr) {
              console.warn('⚠️ WhatsApp reminder falhou (segue email):', (waErr as Error).message);
            }
            const targetEmail = fullProfile.email || payload.customer_email;
            if (targetEmail) {
              try {
                await supabase.functions.invoke('send-transactional-email', {
                  body: {
                    templateName: 'dunning-payment-failed',
                    recipientEmail: targetEmail,
                    idempotencyKey: `installment-renewal-${task.id}`,
                    templateData: { name: firstName, paymentLink: portalUrl },
                  },
                });
                console.log('✅ Installment renewal email enfileirado');
              } catch (emailErr) {
                console.warn('⚠️ Installment renewal email falhou:', (emailErr as Error).message);
              }
            }
            break;
          }

          case 'card_retry_asaas': {
            // Retentativa automática de cartão recorrente Asaas após OVERDUE.
            // Reusa o `creditCardToken` salvo na subscription — não pede cartão de novo.
            // Roda em D+2, D+4, D+7. Se qualquer uma passar, cancela as demais.
            // Se a 3ª (última) falhar, cancela a subscription Asaas pra parar o loop.
            const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY') || '';
            const ASAAS_BASE_URL = (Deno.env.get('ASAAS_ENV') === 'production' || !Deno.env.get('ASAAS_ENV'))
              ? 'https://api.asaas.com/v3'
              : 'https://api-sandbox.asaas.com/v3';
            const paymentId = payload.paymentId as string;
            const subscriptionId = payload.subscriptionId as string;
            const customerId = payload.customerId as string | null;
            const value = Number(payload.value) || 0;
            const attempt = Number(payload.attempt) || 1;
            const maxAttempts = Number(payload.maxAttempts) || 3;

            if (!ASAAS_API_KEY || !paymentId || !subscriptionId) {
              console.warn('⚠️ card_retry_asaas payload incompleto ou sem ASAAS_API_KEY');
              break;
            }

            const asaasFetch = async (path: string, init?: RequestInit) => {
              const r = await fetch(`${ASAAS_BASE_URL}${path}`, {
                ...init,
                headers: {
                  access_token: ASAAS_API_KEY,
                  'Content-Type': 'application/json',
                  'User-Agent': 'Aura/1.0',
                  ...(init?.headers || {}),
                },
              });
              const j = await r.json().catch(() => ({}));
              return { ok: r.ok, status: r.status, json: j };
            };

            // 1) Checar status do payment original — pode já ter sido pago por retry externo.
            const orig = await asaasFetch(`/payments/${paymentId}`);
            const origStatus = (orig.json as any)?.status as string | undefined;
            if (origStatus === 'CONFIRMED' || origStatus === 'RECEIVED' || origStatus === 'RECEIVED_IN_CASH') {
              console.log(`✅ Payment ${paymentId} já pago (${origStatus}), cancelando retries pendentes`);
              await supabase
                .from('scheduled_tasks')
                .update({ status: 'canceled', executed_at: new Date().toISOString() })
                .eq('task_type', 'card_retry_asaas')
                .eq('status', 'pending')
                .contains('payload', { paymentId });
              break;
            }

            // 2) Buscar token do cartão salvo na sub.
            const sub = await asaasFetch(`/subscriptions/${subscriptionId}`);
            const cardToken = (sub.json as any)?.creditCard?.creditCardToken as string | undefined;
            const subCustomer = (sub.json as any)?.customer as string | undefined;
            if (!cardToken) {
              console.warn(`⚠️ Sub ${subscriptionId} sem creditCardToken salvo, retry impossível`);
              // Não faz sentido continuar tentando sem token
              await supabase
                .from('scheduled_tasks')
                .update({ status: 'canceled', executed_at: new Date().toISOString() })
                .eq('task_type', 'card_retry_asaas')
                .eq('status', 'pending')
                .contains('payload', { paymentId });
              break;
            }

            // 3) Cria nova cobrança avulsa reusando o token.
            const today = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'America/Sao_Paulo',
              year: 'numeric', month: '2-digit', day: '2-digit',
            }).format(new Date());
            const chargeResp = await asaasFetch('/payments', {
              method: 'POST',
              body: JSON.stringify({
                customer: customerId || subCustomer,
                billingType: 'CREDIT_CARD',
                creditCardToken: cardToken,
                value,
                dueDate: today,
                description: `Retry ${attempt}/${maxAttempts} - cobrança ${paymentId}`,
                externalReference: `retry_${paymentId}_${attempt}`,
              }),
            });
            const newStatus = (chargeResp.json as any)?.status as string | undefined;
            console.log(`💳 card_retry_asaas #${attempt} payment=${paymentId} status=${newStatus} ok=${chargeResp.ok}`);

            if (chargeResp.ok && (newStatus === 'CONFIRMED' || newStatus === 'RECEIVED')) {
              // Sucesso: cancela demais retries pendentes.
              await supabase
                .from('scheduled_tasks')
                .update({ status: 'canceled', executed_at: new Date().toISOString() })
                .eq('task_type', 'card_retry_asaas')
                .eq('status', 'pending')
                .contains('payload', { paymentId });
              console.log(`✅ Retry #${attempt} recuperou payment ${paymentId}`);
            } else if (attempt >= maxAttempts) {
              // Última tentativa falhou: cancela subscription pra parar de acumular OVERDUE.
              try {
                await asaasFetch(`/subscriptions/${subscriptionId}`, { method: 'DELETE' });
                console.log(`🛑 Sub ${subscriptionId} cancelada após ${maxAttempts} retries falhos`);
              } catch (delErr) {
                console.warn('⚠️ Falha cancelando sub após retries:', (delErr as Error).message);
              }
            }

            // Retry falhou → avança a escada de ofertas no WhatsApp (Lite / Base).
            // O helper calcula o attemptNumber contando envios já feitos nesta subscription.
            if (!(chargeResp.ok && (newStatus === 'CONFIRMED' || newStatus === 'RECEIVED'))) {
              try {
                const { sendDunningWhatsApp } = await import('../_shared/dunning-whatsapp.ts');
                const waRes = await sendDunningWhatsApp({
                  supabase,
                  profile: { user_id: task.user_id, phone: profile.phone, name: profile.name },
                  eventId: `asaas-cardretry-${paymentId}-${attempt}`,
                  provider: 'asaas',
                  paymentId,
                  subscriptionId,
                  customerId: customerId || subCustomer || null,
                  paymentMethod: 'CREDIT_CARD',
                });
                console.log(
                  `📨 dunning pós-retry #${attempt} tier=${waRes.tier} sent=${waRes.sent} skip=${waRes.skipped ?? '-'}`,
                );
              } catch (waErr) {
                console.warn('⚠️ Falha disparando dunning pós-retry:', (waErr as Error).message);
              }
            }
            break;
          }

          case 'asaas_resume_subscription':
          case 'asaas_restore_full_price':
          case 'asaas_pix_resume_subscription': {
            // Retomada de pausa OU restauração do valor cheio após 30% off (3 ciclos).
            //   - asaas_resume_subscription: cria nova sub com o mesmo `value` original.
            //   - asaas_restore_full_price: cria nova sub com o `full_value` e cancela a descontada.
            //   - asaas_pix_resume_subscription: retomada de pausa em sub PIX (sem card token).
            const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY') || '';
            const ASAAS_BASE_URL = (Deno.env.get('ASAAS_ENV') === 'production' || !Deno.env.get('ASAAS_ENV'))
              ? 'https://api.asaas.com/v3'
              : 'https://api-sandbox.asaas.com/v3';
            if (!ASAAS_API_KEY) {
              console.warn(`⚠️ ${task.task_type} sem ASAAS_API_KEY`);
              break;
            }
            const customerId = payload.customer_id as string;
            const isPix = task.task_type === 'asaas_pix_resume_subscription' || payload.billing_type === 'PIX';
            const cardToken = payload.card_token as string | undefined;
            const cycle = (payload.cycle as string) || 'MONTHLY';
            const description = (payload.description as string) || 'Aura - assinatura';
            const targetValue = task.task_type === 'asaas_restore_full_price'
              ? Number(payload.full_value)
              : Number(payload.value);
            if (!customerId || !targetValue || (!isPix && !cardToken)) {
              console.warn(`⚠️ ${task.task_type} payload incompleto`, payload);
              break;
            }
            const asaasFetch = async (path: string, init?: RequestInit) => {
              const r = await fetch(`${ASAAS_BASE_URL}${path}`, {
                ...init,
                headers: {
                  access_token: ASAAS_API_KEY,
                  'Content-Type': 'application/json',
                  'User-Agent': 'Aura/1.0',
                  ...(init?.headers || {}),
                },
              });
              const j = await r.json().catch(() => ({}));
              return { ok: r.ok, status: r.status, json: j };
            };
            const today = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'America/Sao_Paulo',
              year: 'numeric', month: '2-digit', day: '2-digit',
            }).format(new Date());
            const subBody: Record<string, unknown> = {
              customer: customerId,
              billingType: isPix ? 'PIX' : 'CREDIT_CARD',
              cycle,
              value: targetValue,
              nextDueDate: today,
              description,
              externalReference: `aura_${task.task_type}_${task.user_id}_${Date.now()}`,
            };
            if (!isPix) subBody.creditCardToken = cardToken;
            const created = await asaasFetch('/subscriptions', {
              method: 'POST',
              body: JSON.stringify(subBody),
            });
            if (!created.ok) {
              console.warn(`⚠️ ${task.task_type} falhou ao criar sub:`, created.json);
              break;
            }
            if (task.task_type === 'asaas_restore_full_price' && payload.discount_subscription_id) {
              try {
                await asaasFetch(`/subscriptions/${payload.discount_subscription_id}`, { method: 'DELETE' });
              } catch (e) {
                console.warn('⚠️ Falha cancelando sub descontada:', (e as Error).message);
              }
            }
            if (task.task_type === 'asaas_resume_subscription' || task.task_type === 'asaas_pix_resume_subscription') {
              await supabase.from('profiles').update({ status: 'active' }).eq('user_id', task.user_id);
            }
            console.log(`✅ ${task.task_type} OK sub=${(created.json as any)?.id}`);
            break;
          }

          case 'dunning_offer_whatsapp': {
            // Envio de oferta de retenção adiado por estar fora da janela
            // de marketing (08h–21h BRT) no momento do gatilho original.
            const res = await sendDunningWhatsApp({
              supabase,
              profile: { user_id: task.user_id, phone: profile.phone, name: profile.name },
              eventId: payload.event_id,
              provider: ['asaas', 'woovi', 'inter'].includes(String(payload.provider))
                ? (payload.provider as 'asaas' | 'woovi' | 'inter')
                : 'stripe',
              invoiceId: payload.invoice_id ?? null,
              subscriptionId: payload.subscription_id ?? null,
              paymentId: payload.payment_id ?? null,
              customerId: payload.customer_id ?? null,
              forceAttemptNumber: payload.attempt_number ?? 1,
              skipWindowCheck: true,
              paymentMethod: payload.payment_method ?? null,
              noticeSteps: payload.notice_steps ?? undefined,
            });
            console.log(`✅ dunning_offer_whatsapp tier=${res.tier} sent=${res.sent} skipped=${res.skipped ?? '-'}`);
            break;
          }

          // ─────────────────────────────────────────────────────────────────
          // Recuperação silenciosa do PIX Automático (Woovi) — ~37 dias
          //
          // Ciclo não pago não gera aviso nem corte. O Bacen só deixa criar a
          // CobR de 2 a 10 dias ANTES do vencimento (a Woovi cria no 4º dia
          // antes; manual fica entre o 5º e o 10º), então NÃO dá pra forçar a
          // parcela vencida em loop. O que recupera o cliente é:
          //   1. os 3 retries em 7 dias do próprio mandato (3R/7D nativo);
          //   2. o CICLO SEGUINTE, cobrado sozinho pelo mandato vivo, com
          //      outras 3 tentativas — e que a gente só garante criando a CobR
          //      dentro da janela legal.
          // Só depois de dois ciclos falharem a gente fala com o cliente, já
          // com oferta. Paridade com o cartão, onde o acesso segue liberado
          // durante os ~21 dias de Smart Retries do Stripe.
          // ─────────────────────────────────────────────────────────────────
          case 'woovi_cycle_recycle': {
            const { findUnpaidInstallment, retryInstallmentCobr, findScheduledInstallment, daysUntil, MANDATE_ACTIVE_STATUSES } =
              await import('../_shared/woovi.ts');
            const subscriptionId = String(payload.subscription_id || '');
            if (!subscriptionId || !Deno.env.get('WOOVI_APP_ID')) {
              console.warn('⚠️ woovi_cycle_recycle sem subscription_id ou WOOVI_APP_ID');
              break;
            }

            const { data: sub } = await supabase
              .from('woovi_subscriptions')
              .select('id, user_id, subscription_id, status, value_cents, plan, billing_cycle')
              .eq('subscription_id', subscriptionId)
              .maybeSingle();
            if (!sub) {
              console.warn(`⚠️ woovi_cycle_recycle: mandato ${subscriptionId} não encontrado`);
              break;
            }

            // Mandato morto (cliente desautorizou no app do banco) → não há o
            // que reciclar: vai direto pra conversa de oferta.
            const mandateAlive = MANDATE_ACTIVE_STATUSES.includes(String(sub.status || '').toUpperCase());

            // Já pagou no meio do caminho? encerra a recuperação em silêncio.
            const installment = mandateAlive ? await findUnpaidInstallment(subscriptionId) : null;
            if (mandateAlive && !installment) {
              console.log(`✅ woovi ${subscriptionId} sem parcela em aberto — recuperação encerrada`);
              await supabase
                .from('scheduled_tasks')
                .update({ status: 'canceled', executed_at: new Date().toISOString() })
                .in('task_type', ['woovi_cycle_recycle', 'woovi_next_cycle_cobr', 'woovi_recovery_offer', 'woovi_recovery_final'])
                .eq('status', 'pending')
                .contains('payload', { subscription_id: subscriptionId });
              break;
            }

            if (mandateAlive && installment) {
              // UMA tentativa oportunista enquanto a CobR do ciclo ainda está
              // viva. Recusa por janela é esperada — só logamos.
              const retry = await retryInstallmentCobr(installment.globalID);
              await logWooviAttempt(supabase, {
                subscriptionId,
                userId: sub.user_id,
                installmentId: installment.globalID,
                label: 'cycle_retry',
                ok: retry.ok,
                status: retry.ok ? 'RETRY_REQUESTED' : `RETRY_REJECTED_${retry.status}`,
                valueCents: Number(sub.value_cents || 0),
                dueDate: installment.dueDate,
                raw: retry.raw,
              });
              console.log(
                `🔁 woovi retry único sub=${subscriptionId} parcela=${installment.globalID} ok=${retry.ok}`,
              );

              // Agenda a criação da CobR do ciclo seguinte dentro da janela
              // legal (mira 8 dias antes do vencimento: entre 5 e 10).
              const next = await findScheduledInstallment(subscriptionId);
              if (next?.dueDate) {
                const lead = daysUntil(next.dueDate);
                const runInDays = Math.max(0, lead - 8);
                await supabase.from('scheduled_tasks').insert({
                  user_id: task.user_id,
                  task_type: 'woovi_next_cycle_cobr',
                  execute_at: new Date(Date.now() + runInDays * 24 * 3600 * 1000 + 60 * 1000).toISOString(),
                  status: 'pending',
                  payload: { ...payload, next_due_date: next.dueDate },
                });
                console.log(
                  `📅 woovi ${subscriptionId}: CobR do ciclo seguinte (${next.dueDate}) agendada em ${runInDays}d`,
                );
                break;
              }
              console.warn(`⚠️ woovi ${subscriptionId} sem parcela agendada — vai direto pra oferta`);
            }

            // Fim da janela silenciosa (ou mandato já morto): abre a conversa
            // de oferta no próximo dia útil de marketing.
            await supabase.from('scheduled_tasks').insert({
              user_id: task.user_id,
              task_type: 'woovi_recovery_offer',
              execute_at: new Date(Date.now() + 60 * 1000).toISOString(),
              status: 'pending',
              payload: { ...payload, offer_step: 1 },
            });
            break;
          }

          // Cria a CobR da parcela seguinte dentro da janela do Bacen (5–10
          // dias antes) e só então marca o fim da janela silenciosa: a oferta
          // vai pra 8 dias DEPOIS do vencimento, quando os 3 retries nativos
          // desse novo ciclo já terminaram.
          case 'woovi_next_cycle_cobr': {
            const { findUnpaidInstallment, findScheduledInstallment, createInstallmentCobr, daysUntil, MANDATE_ACTIVE_STATUSES } =
              await import('../_shared/woovi.ts');
            const subscriptionId = String(payload.subscription_id || '');
            if (!subscriptionId || !Deno.env.get('WOOVI_APP_ID')) break;

            const { data: sub } = await supabase
              .from('woovi_subscriptions')
              .select('id, user_id, subscription_id, status, value_cents')
              .eq('subscription_id', subscriptionId)
              .maybeSingle();
            if (!sub) break;

            const mandateAlive = MANDATE_ACTIVE_STATUSES.includes(String(sub.status || '').toUpperCase());
            if (mandateAlive && !(await findUnpaidInstallment(subscriptionId))) {
              console.log(`✅ woovi ${subscriptionId} regularizado — cadência encerrada`);
              await cancelWooviRecovery(supabase, subscriptionId);
              break;
            }

            let offerInDays = 8;
            if (mandateAlive) {
              const next = await findScheduledInstallment(subscriptionId);
              if (next?.dueDate) {
                const lead = daysUntil(next.dueDate);
                if (lead > 10) {
                  // Fora da janela: espera até entrar nela em vez de queimar a tentativa.
                  await supabase.from('scheduled_tasks').insert({
                    user_id: task.user_id,
                    task_type: 'woovi_next_cycle_cobr',
                    execute_at: new Date(Date.now() + (lead - 9) * 24 * 3600 * 1000).toISOString(),
                    status: 'pending',
                    payload: { ...payload, next_due_date: next.dueDate },
                  });
                  console.log(`⏳ woovi ${subscriptionId}: fora da janela (${lead}d) — reagendado`);
                  break;
                }
                const created = await createInstallmentCobr(next.globalID, Number(sub.value_cents || 0) || undefined);
                await logWooviAttempt(supabase, {
                  subscriptionId,
                  userId: sub.user_id,
                  installmentId: next.globalID,
                  label: 'next_cycle_cobr',
                  ok: created.ok,
                  status: created.ok ? 'COBR_CREATED' : `COBR_REJECTED_${created.status}`,
                  valueCents: Number(sub.value_cents || 0),
                  dueDate: next.dueDate,
                  raw: created.raw,
                });
                console.log(
                  `🧾 woovi ${subscriptionId}: CobR ciclo seguinte (${next.dueDate}) ok=${created.ok}`,
                );
                // A oferta só entra depois do vencimento + 7 dias de retries nativos.
                offerInDays = Math.max(1, daysUntil(next.dueDate) + 8);
              }
            }

            await supabase.from('scheduled_tasks').insert({
              user_id: task.user_id,
              task_type: 'woovi_recovery_offer',
              execute_at: new Date(Date.now() + offerInDays * 24 * 3600 * 1000).toISOString(),
              status: 'pending',
              payload: { ...payload, offer_step: 1 },
            });
            break;
          }

          case 'woovi_recovery_offer': {
            // Primeira e única conversa da janela: oferta (30% off → Lite).
            // O link leva a /cancelar?offer=..., que no trilho Woovi gera um QR
            // NOVO — o cliente pode pagar de outra conta, já que a atual é
            // justamente a que está sem saldo.
            const subscriptionId = String(payload.subscription_id || '');
            const step = Number(payload.offer_step || 1);
            const { data: sub } = await supabase
              .from('woovi_subscriptions')
              .select('id, status, subscription_id')
              .eq('subscription_id', subscriptionId)
              .maybeSingle();

            // Guarda dura: nunca oferecer desconto pra quem já regularizou.
            if (subscriptionId && Deno.env.get('WOOVI_APP_ID')) {
              const { findUnpaidInstallment, MANDATE_ACTIVE_STATUSES } =
                await import('../_shared/woovi.ts');
              const alive = MANDATE_ACTIVE_STATUSES.includes(String(sub?.status || '').toUpperCase());
              if (alive && !(await findUnpaidInstallment(subscriptionId))) {
                console.log(`✅ woovi ${subscriptionId} pago — oferta abortada`);
                await cancelWooviRecovery(supabase, subscriptionId);
                break;
              }
            }

            const offerRes = await sendDunningWhatsApp({
              supabase,
              profile: { user_id: task.user_id, phone: profile.phone, name: profile.name },
              eventId: `woovi-recovery-${subscriptionId}-${payload.payment_id ?? 'cycle'}-${step}`,
              provider: 'woovi',
              paymentId: (payload.payment_id as string) ?? null,
              subscriptionId: subscriptionId || null,
              customerId: null,
              paymentMethod: 'PIX',
              // Zero avisos genéricos: no PIX a gente não fala de falha.
              noticeSteps: 0,
              forceAttemptNumber: step,
            });
            console.log(
              `📨 woovi_recovery_offer #${step} tier=${offerRes.tier} sent=${offerRes.sent} skip=${offerRes.skipped ?? '-'}`,
            );

            if (step === 1) {
              // Reforço com o degrau seguinte (Lite) em D+3.
              await supabase.from('scheduled_tasks').insert({
                user_id: task.user_id,
                task_type: 'woovi_recovery_offer',
                execute_at: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
                status: 'pending',
                payload: { ...payload, offer_step: 2 },
              });
            } else {
              await supabase.from('scheduled_tasks').insert({
                user_id: task.user_id,
                task_type: 'woovi_recovery_final',
                execute_at: new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString(),
                status: 'pending',
                payload: { ...payload },
              });
            }
            void sub;
            break;
          }

          case 'woovi_recovery_final': {
            // Esgotado tudo: aí sim marca a inadimplência e encerra o mandato.
            const { findUnpaidInstallment, wooviFetch } = await import('../_shared/woovi.ts');
            const subscriptionId = String(payload.subscription_id || '');
            const stillUnpaid = await findUnpaidInstallment(subscriptionId);
            if (!stillUnpaid) {
              console.log(`✅ woovi ${subscriptionId} regularizado antes do encerramento`);
              break;
            }
            await wooviFetch(`/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
              method: 'DELETE',
            }).catch(() => null);
            await supabase
              .from('woovi_subscriptions')
              .update({ status: 'CANCELADA', last_error: 'recuperação de 30 dias esgotada' })
              .eq('subscription_id', subscriptionId);
            await supabase
              .from('profiles')
              .update({ payment_failed_at: new Date().toISOString(), status: 'canceled' })
              .eq('user_id', task.user_id);
            console.log(`🛑 woovi ${subscriptionId} encerrado após recuperação silenciosa`);
            break;
          }

          case 'dunning_pix_followup': {
            // Cadência de dunning do PIX (recorrente e PIX Automático), Asaas ou
            // Woovi. O gateway emite a falha uma única vez por cobrança e não há
            // retry de cartão no PIX, então a escada (aviso 2 → 30% → Lite)
            // avança por estas tarefas agendadas em D+2, D+4 e D+7.
            const dunningProvider = (payload.provider === 'woovi' ? 'woovi' : 'asaas') as 'woovi' | 'asaas';
            const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY') || '';
            const ASAAS_BASE_URL = (Deno.env.get('ASAAS_ENV') === 'production' || !Deno.env.get('ASAAS_ENV'))
              ? 'https://api.asaas.com/v3'
              : 'https://api-sandbox.asaas.com/v3';
            const pixPaymentId = payload.payment_id as string;
            const WOOVI_APP_ID = Deno.env.get('WOOVI_APP_ID') || '';
            const providerKeyMissing = dunningProvider === 'woovi' ? !WOOVI_APP_ID : !ASAAS_API_KEY;
            if (providerKeyMissing || !pixPaymentId) {
              console.warn(`⚠️ dunning_pix_followup payload incompleto ou sem credencial (${dunningProvider})`);
              break;
            }

            // 1) Já pago? cancela o resto da cadência e não envia nada.
            let pixStatus: string | undefined;
            if (dunningProvider === 'woovi') {
              const wResp = await fetch(
                `https://api.woovi.com/api/v1/charge/${encodeURIComponent(pixPaymentId)}`,
                { headers: { Authorization: WOOVI_APP_ID, 'Content-Type': 'application/json' } },
              );
              const wJson: any = await wResp.json().catch(() => ({}));
              pixStatus = (wJson?.charge?.status ?? wJson?.status) as string | undefined;
            } else {
              const pixResp = await fetch(`${ASAAS_BASE_URL}/payments/${pixPaymentId}`, {
                headers: {
                  access_token: ASAAS_API_KEY,
                  'Content-Type': 'application/json',
                  'User-Agent': 'Aura/1.0',
                },
              });
              const pixJson: any = await pixResp.json().catch(() => ({}));
              pixStatus = pixJson?.status as string | undefined;
            }
            const paidStatuses = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'COMPLETED', 'PAID'];
            if (pixStatus && paidStatuses.includes(String(pixStatus).toUpperCase())) {
              console.log(`✅ PIX ${pixPaymentId} já pago (${pixStatus}), cancelando cadência pendente`);
              await supabase
                .from('scheduled_tasks')
                .update({ status: 'canceled', executed_at: new Date().toISOString() })
                .eq('task_type', 'dunning_pix_followup')
                .eq('status', 'pending')
                .contains('payload', { payment_id: pixPaymentId });
              break;
            }

            // 2) Segue em aberto → avança a escada (o helper conta por payment_id).
            const pixRes = await sendDunningWhatsApp({
              supabase,
              profile: { user_id: task.user_id, phone: profile.phone, name: profile.name },
              eventId: `${dunningProvider}-pixdunning-${pixPaymentId}-${payload.attempt ?? 1}`,
              provider: dunningProvider,
              paymentId: pixPaymentId,
              subscriptionId: payload.subscription_id ?? null,
              customerId: payload.customer_id ?? null,
              paymentMethod: payload.payment_method ?? 'PIX',
            });
            console.log(
              `📨 dunning_pix_followup #${payload.attempt ?? 1} tier=${pixRes.tier} sent=${pixRes.sent} skipped=${pixRes.skipped ?? '-'}`,
            );
            break;
          }

          default:
            console.warn(`⚠️ Unknown task type: ${task.task_type}`);
        }

        // Mark as executed
        await supabase
          .from('scheduled_tasks')
          .update({ status: 'executed', executed_at: new Date().toISOString() })
          .eq('id', task.id);
        executed++;

      } catch (error) {
        console.error(`❌ Error processing task ${task.id}:`, error);
        await supabase
          .from('scheduled_tasks')
          .update({ status: 'failed', executed_at: new Date().toISOString() })
          .eq('id', task.id);
        failed++;
      }

      // Anti-burst delay: 300ms between sends
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`✅ [CRON] Finished: ${executed} executed, ${failed} failed out of ${tasks.length} total`);

    return new Response(JSON.stringify({
      status: 'completed',
      total: tasks.length,
      executed,
      failed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ [CRON] Fatal error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
