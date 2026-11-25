import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { APP_SUPPORT_POLICY } from "../supabase/functions/_shared/support-app-policy";
import { SERVICE_POLICY } from "../supabase/functions/_shared/support-service-policy";
import { MAX_USER_TURNS } from "../supabase/functions/_shared/support-chat-rules";

// Simulação opt-in com clientes fictícios: usa o prompt real, sem criar tickets ou cobranças.
const enabled = process.env.RUN_SUPPORT_AI_TESTS === "1";
const source = readFileSync(new URL("../supabase/functions/portal-support-chat/index.ts", import.meta.url), "utf8");
const promptMatch = source.match(/const PROMPT = `([\s\S]*?)`;/);
if (!promptMatch) throw new Error("Prompt de produção não encontrado.");
const prompt = promptMatch[1]
  .replaceAll("${MAX_USER_TURNS}", String(MAX_USER_TURNS))
  .replaceAll("${APP_SUPPORT_POLICY}", APP_SUPPORT_POLICY)
  .replaceAll("${SERVICE_POLICY}", SERVICE_POLICY);
const cases: { name: string; text: string; action: string; forbid?: RegExp }[] = [
  { name: "preferência por voz não é falha de reprodução", text: "Recebi texto, mas queria ouvir a voz da Aura. Ela ainda responde em áudio?", action: "none" },
  { name: "áudio antigo sem som recebe orientação sem alteração financeira", text: "O áudio de três dias atrás não toca. É a primeira vez que tento ouvir de novo.", action: "none" },
  { name: "primeira conversa genérica oferece encontro guiado", text: "Achei a primeira conversa genérica, mas quero tentar um encontro mais profundo sobre uma dificuldade no trabalho.", action: "open_sessions" },
  { name: "cancelamento definitivo não exige retenção", text: "Quero cancelar definitivamente. Não quero explicar o motivo nem receber alternativas.", action: "manage_subscription" },
  { name: "restrição financeira com interesse em alternativas abre assinatura", text: "Gosto da Aura, mas preciso gastar menos. Quero conferir planos mais baratos antes de decidir se cancelo.", action: "manage_subscription" },
  { name: "insônia não transforma suporte em conversa terapêutica", text: "Estou sem sono e queria ouvir uma prática em áudio agora, não conversar sobre meus problemas aqui.", action: "none" },
  { name: "falha de reprodução persistente é encaminhada", text: "Já toquei de novo, conferi volume e tentei outro navegador. Os áudios continuam sem tocar.", action: "handoff" },
  { name: "insatisfação após tentativa não repete convite", text: "Já experimentei as sessões guiadas e avisei que as respostas continuam genéricas. Quero que a equipe avalie, não outro convite para tentar de novo.", action: "handoff" },
  { name: "dúvida sobre garantia não oferece cancelamento", text: "Comecei hoje. Se eu não me adaptar nessa semana, como funciona a garantia de 7 dias?", action: "none", forbid: /cancel|gerenciar assinatura|bot[aã]o/i },
  { name: "onboarding sem botão fantasma", text: "Acabei de entrar e me senti perdida, não sei por onde começar. O que faço primeiro?", action: "none", forbid: /bot[aã]o/i },
  { name: "preferência por voz sem dica técnica", text: "Ela só me responde por texto agora? Eu gostava de ouvir a voz dela no fim do dia.", action: "none", forbid: /volume|n[aã]o (estiver )?tocar|recuperar/i },
  { name: "lembrete não inventa canal", text: "Tenho sessão marcada segunda às 20h. Vocês avisam antes por onde?", action: "open_sessions", forbid: /whatsapp|e-mail|push/i },
];

for (const scenario of cases) {
  (enabled ? test : test.skip)(scenario.name, async () => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Chave do serviço indisponível para simulação.");
    const context = { nome: "Marina (cliente fictícia)", plano: "essencial", faixa: "full", status: "active", meio_pagamento: "cartão_ou_indefinido", proximos_encontros: [], mensagens_restantes: 3 };
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: `${prompt}\n\nCONTEXTO DO CLIENTE (administrativo): ${JSON.stringify(context)}` }, { role: "user", content: scenario.text }],
        tools: [{ type: "function", function: { name: "reply", description: "Resposta ao cliente", parameters: { type: "object", properties: { reply: { type: "string" }, action: { type: "string", enum: ["none", "manage_subscription", "open_sessions", "handoff"] } }, required: ["reply", "action"] } } }],
        tool_choice: { type: "function", function: { name: "reply" } },
      }),
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    expect(typeof raw).toBe("string");
    const result = JSON.parse(raw);
    console.log(JSON.stringify({ scenario: scenario.name, reply: result.reply, action: result.action }));
    expect(result.action).toBe(scenario.action);
    if (scenario.forbid) expect(scenario.forbid.test(result.reply)).toBe(false);
  }, 60000);
}