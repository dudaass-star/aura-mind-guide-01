import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) => console.log(`[SUPPORT-AGENT] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

const SYSTEM_PROMPT = `Você é a Aura Support, assistente de IA de suporte ao cliente da Aura (terapia conversacional via WhatsApp).

CONTEXTO DA AURA:
- Produto: companhia terapêutica via WhatsApp, baseada em Logoterapia, Estoicismo e Investigação Socrática
- Site: olaaura.com.br
- Cobrança via Stripe, planos: Essencial (R$ 29,90/mês ou R$ 214,90/ano), Direção (R$ 49,90/mês ou R$ 359,90/ano), Transformação (R$ 99,90/mês ou R$ 719,90/ano)
- Trial pago semanal: Essencial R$ 6,90, Direção R$ 11,90, Transformação R$ 24,90

SUA TAREFA:
Analisar o email do cliente, classificar, gerar um rascunho de resposta em PT-BR (tom Aura: caloroso, direto, sem disclaimers de IA), e sugerir uma ação estruturada.

FONTE DE VERDADE — BASE DE CONHECIMENTO OFICIAL:
- Quando o bloco "BASE DE CONHECIMENTO OFICIAL" estiver presente no contexto, use-o como ÚNICA fonte de verdade para políticas (reembolso, cancelamento, prazos, valores, LGPD, etc).
- NUNCA invente políticas ou prazos que não estejam na KB. Se a pergunta tocar em política e não houver artigo cobrindo, escreva no rascunho que vai verificar com a equipe e sugira ação "none".
- Pode parafrasear os artigos da KB, mas mantenha fidelidade a valores, prazos e condições exatos.
- O contexto do cliente (Stripe, profile, WhatsApp) serve apenas para personalizar a resposta — não é fonte de política.

TOM DA RESPOSTA:
- Português do Brasil informal mas profissional
- Empática mas resolutiva — sem rodeios
- Assinatura: "Equipe Aura"
- NUNCA mencione que é IA. Você É a Equipe Aura.
- Se houver problema técnico, peça detalhes específicos
- Se for cobrança/cancelamento, seja transparente e ofereça opções claras

CATEGORIAS:
- duvida_tecnica, cancelamento, pausa, reembolso, cobranca_falhou, bug, troca_plano, elogio, outro

SEVERIDADES:
- baixa: FAQ simples
- media: cobrança, troca de plano
- alta: reembolso, jurídico, ameaça pública, dados pessoais (LGPD)

AÇÕES SUGERIDAS (escolha APENAS UMA):
- none: só responder, sem ação
- send_portal_link: enviar link do portal /meu-espaco
- send_stripe_billing_portal: link de gestão Stripe (atualizar cartão, baixar faturas)
- cancel_subscription: cancelar assinatura agora
- pause_subscription: pausar por X dias (informe pause_days)
- refund_invoice: reembolsar fatura específica (informe invoice_id e amount_cents se parcial)
- retry_payment: tentar cobrar de novo com método salvo
- change_plan: trocar plano (informe new_plan: essencial|direcao|transformacao e billing: monthly|yearly)

IMPORTANTE:
- Toda ação será REVISADA por um humano antes de executar
- Se não tiver certeza, sugira "none" e peça mais informação no rascunho
- Para reembolso de alto valor (>R$100) ou casos jurídicos, sugira "none" e escale ao admin no rascunho`;

// Categorias seguras pra auto-resposta (nunca incluem ações financeiras/sensíveis)
const SAFE_AUTO_REPLY_CATEGORIES = new Set(["duvida_tecnica", "elogio", "outro"]);
const AUTO_REPLY_KB_THRESHOLD = 0.82;
const RECURRING_CUSTOMER_THRESHOLD = 3; // 3+ tickets em 30d

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticket_id, hint } = await req.json();
    if (!ticket_id) throw new Error("ticket_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load ticket + last inbound message
    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", ticket_id)
      .single();
    if (tErr || !ticket) throw new Error(`Ticket not found: ${tErr?.message}`);

    const { data: messages } = await supabase
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", ticket_id)
      .order("created_at", { ascending: true });

    // Build customer context
    const context: Record<string, unknown> = { ticket: { subject: ticket.subject, category: ticket.category } };

    // ========== Histórico de tickets do cliente (últimos 90 dias) ==========
    let recurringCustomer = false;
    try {
      const { data: ticketCount } = await supabase.rpc("count_recent_tickets", {
        _email: ticket.customer_email,
        _days: 30,
      });
      const count30d = typeof ticketCount === "number" ? ticketCount : 0;
      recurringCustomer = count30d >= RECURRING_CUSTOMER_THRESHOLD;

      const { data: history } = await supabase.rpc("get_customer_ticket_history", {
        _email: ticket.customer_email,
        _days: 90,
        _limit: 5,
      });
      context.customer_history = {
        tickets_last_30d: count30d,
        tickets_last_90d: history?.length || 0,
        recurring: recurringCustomer,
        recent_tickets: history || [],
      };
      log("Customer history", { email: ticket.customer_email, count30d, recurring: recurringCustomer });
    } catch (e) {
      log("Customer history lookup failed", { error: String(e) });
    }

    if (ticket.profile_user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, phone, email, plan, status, trial_started_at, plan_expires_at, sessions_used_this_month, created_at")
        .eq("user_id", ticket.profile_user_id)
        .single();
      context.profile = profile;

      // Last 10 WhatsApp messages
      const { data: waMsgs } = await supabase
        .from("messages")
        .select("role, content, created_at")
        .eq("user_id", ticket.profile_user_id)
        .order("created_at", { ascending: false })
        .limit(10);
      context.recent_whatsapp = waMsgs?.reverse() || [];
    }

    // Stripe context if email available
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey && ticket.customer_email) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
        const customers = await stripe.customers.list({ email: ticket.customer_email, limit: 1 });
        if (customers.data.length > 0) {
          const customer = customers.data[0];
          const [subs, invoices] = await Promise.all([
            stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 5 }),
            stripe.invoices.list({ customer: customer.id, limit: 5 }),
          ]);
          context.stripe = {
            customer_id: customer.id,
            subscriptions: subs.data.map((s) => ({
              id: s.id, status: s.status,
              current_period_end: s.current_period_end,
              cancel_at_period_end: s.cancel_at_period_end,
              price_id: s.items.data[0]?.price.id,
              amount: s.items.data[0]?.price.unit_amount,
            })),
            invoices: invoices.data.map((i) => ({
              id: i.id, status: i.status, amount_paid: i.amount_paid,
              amount_due: i.amount_due, created: i.created,
              hosted_invoice_url: i.hosted_invoice_url,
            })),
          };
        }
      } catch (e) {
        log("Stripe lookup failed", { error: String(e) });
      }
    }

    const inboundEmails = (messages || [])
      .filter((m) => m.direction === "inbound")
      .map((m) => `[${m.from_email}]: ${m.body_text || "(sem texto)"}`)
      .join("\n\n---\n\n");

    // ========== RAG: search knowledge base ==========
    let kbBlock = "";
    let kbUsedIds: string[] = [];
    let kbTopScore: number | null = null;
    try {
      const lastInbound = (messages || []).filter((m) => m.direction === "inbound").slice(-1)[0];
      const queryText = `${ticket.subject}\n\n${lastInbound?.body_text || ""}`.slice(0, 4000);
      const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_CLOUD_API_KEY");
      if (apiKey && queryText.trim()) {
        const embResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "models/gemini-embedding-001",
              content: { parts: [{ text: queryText }] },
              outputDimensionality: 768,
            }),
          },
        );
        if (embResp.ok) {
          const embData = await embResp.json();
          const embedding: number[] = embData?.embedding?.values || [];
          if (embedding.length === 768) {
            const { data: matches } = await supabase.rpc("match_support_kb", {
              query_embedding: embedding as unknown as string,
              match_threshold: 0.55,
              match_count: 5,
            });
            if (matches && matches.length > 0) {
              kbUsedIds = matches.map((m: { id: string }) => m.id);
              kbTopScore = matches[0]?.similarity ?? null;
              kbBlock = `\n\n=== BASE DE CONHECIMENTO OFICIAL (use como ÚNICA fonte de política) ===\n` +
                matches.map((m: { title: string; category: string; question: string; answer: string; similarity: number }, idx: number) =>
                  `[Artigo ${idx + 1} — ${m.category} — relevância ${(m.similarity * 100).toFixed(0)}%]\n` +
                  `Título: ${m.title}\n` +
                  `Pergunta canônica: ${m.question}\n` +
                  `Resposta oficial:\n${m.answer}`,
                ).join("\n\n---\n\n") +
                `\n=== FIM DA BASE DE CONHECIMENTO ===`;
              log("KB matches", { count: matches.length, ids: kbUsedIds });
            } else {
              kbBlock = `\n\n=== BASE DE CONHECIMENTO OFICIAL ===\nNenhum artigo relevante encontrado na KB para esta pergunta. Se for questão de política, NÃO invente — diga no rascunho que vai verificar com a equipe e sugira ação "none".\n=== FIM ===`;
              log("KB no matches");
            }
          }
        }
      }
    } catch (e) {
      log("KB search failed", { error: String(e) });
    }

    const userPrompt = `EMAIL DO CLIENTE:
Assunto: ${ticket.subject}
De: ${ticket.customer_email}

${inboundEmails}

CONTEXTO DO CLIENTE:
${JSON.stringify(context, null, 2)}${kbBlock}
${recurringCustomer ? `\n⚠️ ATENÇÃO: Cliente RECORRENTE (${RECURRING_CUSTOMER_THRESHOLD}+ tickets em 30 dias). Reconheça o histórico no rascunho, evite respostas genéricas, e sugira escalonar pra revisão humana se for o mesmo problema repetido.\n` : ""}

${hint ? `INSTRUÇÃO DO ADMIN: ${hint}\n` : ""}
Analise e responda com a estrutura solicitada.`;

    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!aiKey) throw new Error("LOVABLE_API_KEY not configured");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "submit_support_draft",
            description: "Submeter classificação, rascunho e ação sugerida",
            parameters: {
              type: "object",
              properties: {
                category: { type: "string", enum: ["duvida_tecnica","cancelamento","pausa","reembolso","cobranca_falhou","bug","troca_plano","elogio","outro"] },
                severity: { type: "string", enum: ["baixa","media","alta"] },
                draft_response: { type: "string", description: "Corpo da resposta em PT-BR, pronto para enviar" },
                suggested_action: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["none","send_portal_link","send_stripe_billing_portal","cancel_subscription","pause_subscription","refund_invoice","retry_payment","change_plan"] },
                    reason: { type: "string", description: "Por que essa ação" },
                    params: { type: "object", description: "Parâmetros: subscription_id, invoice_id, amount_cents, pause_days, new_plan, billing", additionalProperties: true },
                  },
                  required: ["type", "reason"],
                },
                summary: { type: "string", description: "Resumo de 1 linha pro admin" },
              },
              required: ["category", "severity", "draft_response", "suggested_action", "summary"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "submit_support_draft" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      throw new Error(`AI gateway ${aiResp.status}: ${t}`);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call returned");
    const args = JSON.parse(toolCall.function.arguments);

    // Mark previous drafts as not current
    await supabase.from("support_ticket_drafts").update({ is_current: false }).eq("ticket_id", ticket_id);

    const { data: draft, error: dErr } = await supabase.from("support_ticket_drafts").insert({
      ticket_id,
      ai_model: "google/gemini-2.5-pro",
      draft_body: args.draft_response,
      suggested_action: args.suggested_action,
      context_snapshot: { context, summary: args.summary, kb_used: kbUsedIds },
      hint: hint || null,
      is_current: true,
    }).select().single();
    if (dErr) throw dErr;

    // Increment usage_count for cited KB articles
    if (kbUsedIds.length > 0) {
      await supabase.rpc("increment_kb_usage", { kb_ids: kbUsedIds });
    }

    // Update ticket classification
    await supabase.from("support_tickets").update({
      category: args.category,
      severity: args.severity,
    }).eq("id", ticket_id);

    return new Response(JSON.stringify({ ok: true, draft }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("Error", { error: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});