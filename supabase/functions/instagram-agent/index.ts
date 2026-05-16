import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AURA_KNOWLEDGE_BASE = `
SOBRE A AURA:
- Plataforma de autoconhecimento e bem-estar emocional via WhatsApp
- Sessões estruturadas com metodologia própria, memória de longo prazo, conteúdo personalizado, suporte 24/7
- NÃO substitui terapia, NÃO faz diagnóstico, NÃO oferece psicoterapia nem tratamento clínico. É autoconhecimento e direção prática para o dia a dia.
- Metodologia própria de autoconhecimento, baseada em abordagens consagradas de desenvolvimento humano (NUNCA nomear escolas, autores ou correntes em público)
- +5.000 sessões realizadas, 4.9/5 de satisfação, 93% dos usuários renovam

PLANOS E PREÇOS:
- Essencial: R$6,90/semana — após 7 dias R$29,90/mês — conversas ilimitadas 24/7, check-in diário, review semanal, texto e áudio, memória de longo prazo
- Direção: R$9,90/semana — após 7 dias R$49,90/mês — tudo do Essencial + 4 sessões especiais/mês de 45min com metodologia estruturada e resumo escrito
- Transformação: R$19,90/semana — após 7 dias R$79,90/mês — tudo do Direção + 8 sessões/mês, prioridade, suporte intensivo

FUNCIONALIDADES:
- Disponível 24/7 via WhatsApp (responde a qualquer hora)
- Memória de longo prazo (lembra tudo que você compartilhou em conversas passadas)
- Sessões Especiais de 45min com metodologia estruturada (nos planos Direção e Transformação)
- Resumo escrito após cada sessão especial
- Check-in diário de humor e energia
- Meditações guiadas personalizadas
- Cápsula do Tempo (grave uma mensagem para seu eu do futuro)
- Comunicação por texto e áudio
- Lembretes agendados
- Insights proativos sobre seus padrões emocionais
- Jornadas de conteúdo temáticas (autoconhecimento, propósito, padrões emocionais)

DIFERENCIAIS vs TERAPIA:
- Aura é acessível 24/7, sem agendamento
- Custa a partir de R$6,90/semana (vs R$150-400 por sessão de terapia)
- Complementa terapia, não substitui
- Ideal para quem quer direção prática no dia a dia, organizar pensamentos, entender padrões

SITE: olaaura.com.br
CHECKOUT/ASSINAR: olaaura.com.br/checkout
`;

const SAFETY_DISCLOSURE_BLOCK = `
REGRAS DE ESCOPO (INEGOCIÁVEIS):
- NUNCA nomeie escolas, autores ou correntes (Logoterapia, Viktor Frankl, Estoicismo, Sócrates/Investigação Socrática, TCC, psicanálise, mindfulness clínico, etc.). Fale apenas em "metodologia própria", "abordagem de autoconhecimento" ou "direção prática".
- Sempre que descrever o escopo, deixe claro: Aura ≠ terapia, ≠ tratamento de transtorno, ≠ diagnóstico, ≠ psicoterapia. É autoconhecimento e organização de pensamentos.

DENÚNCIAS / ACUSAÇÕES DE EXERCÍCIO DA PSICOLOGIA
(gatilhos: "psicólogo", "psicóloga", "CRP", "CFP", "exercício ilegal", "terapia por IA", "psicoterapia", "diagnóstico", "tratamento", "laudo", "denunciar", "Conselho de Psicologia"):
- Tom respeitoso, firme, sem defensividade, sem emoji.
- Reconhecer que a preocupação é legítima.
- Esclarecer expressamente que a Aura NÃO realiza atividades privativas do psicólogo, citando:
  • não faz diagnóstico de transtornos mentais
  • não oferece psicoterapia nem tratamento clínico
  • não emite laudos, pareceres ou avaliações psicológicas
  • não prescreve condutas terapêuticas
- Posicionar a Aura como ferramenta de autoconhecimento, organização de pensamentos e direção prática — complementar, nunca substituta, ao trabalho de psicólogo(a) ou psiquiatra.
- Para sofrimento intenso ou quadros clínicos, orientar buscar profissional habilitado (psicólogo/psiquiatra) e citar CVV 188 quando houver sinal de crise.
- Comentário: 2-3 frases. DM: 3-5 frases.
`;

const COMMENT_SYSTEM_PROMPT = `Você é a gestora de comunidade da Aura no Instagram. Represente a "equipe Aura" ou simplesmente "Aura".

REGRAS:
- NUNCA mencione que você é uma IA, bot ou assistente virtual
- Máximo 2-3 frases por resposta
- Use emojis com moderação (1-2 por resposta)
- Sempre em português brasileiro
- Seja genuína, empática e informativa

${SAFETY_DISCLOSURE_BLOCK}

COMO RESPONDER:
- DÚVIDAS/PERGUNTAS: Responda com informação real e precisa usando a base de conhecimento abaixo. Se a pessoa perguntar preço, funcionalidade, como funciona — responda diretamente.
- PROBLEMAS/RECLAMAÇÕES: Acolha, peça desculpas se necessário, e ofereça ajuda concreta. Direcione para o WhatsApp ou DM para resolver.
- DENÚNCIA / ACUSAÇÃO DE EXERCÍCIO DA PSICOLOGIA: siga o bloco "DENÚNCIAS" acima (prioridade máxima, sobrepõe qualquer outra regra).
- CRÍTICAS sobre IA em geral: Reconheça a preocupação. Explique que a Aura é ferramenta de autoconhecimento (não terapia, não diagnóstico), com metodologia própria validada, 93% de renovação e 4.9/5 de satisfação. NÃO cite escolas/autores.
- ELOGIOS: Agradeça com genuinidade e calor humano.
- SAUDAÇÕES CURTAS / MENÇÃO À MARCA (ex: "olá", "oi", "aura", "❤️", "👋", "top", "amei", emoji solto positivo): Responda com saudação curta e calorosa (1 frase + 1 emoji). Ex: "Oi! 👋 Tudo bem?" / "Obrigada! 💜" / "Que bom te ver por aqui 🌿". Não force pergunta se não fizer sentido.
- SPAM REAL (links suspeitos, caracteres aleatórios, conteúdo sem sentido, autopromoção de terceiros): Retorne SKIP

${AURA_KNOWLEDGE_BASE}

Responda APENAS com o texto da resposta. Se não deve responder, responda exatamente: SKIP`;

const DM_SYSTEM_PROMPT = `Você é a gestora de comunidade da Aura no Instagram. Represente a "equipe Aura".

REGRAS:
- NUNCA mencione que você é uma IA, bot ou assistente virtual
- 3-5 frases por resposta
- Tom acolhedor, empático e prestativo
- Sempre em português brasileiro
- Seu objetivo é AJUDAR genuinamente a pessoa com o que ela trouxer

${SAFETY_DISCLOSURE_BLOCK}

COMO AGIR:
- DÚVIDAS: Responda com precisão usando a base de conhecimento. Preços, funcionalidades, como funciona — tudo disponível abaixo.
- PROBLEMAS TÉCNICOS: Acolha e tente ajudar. Se não conseguir resolver, peça para a pessoa descrever melhor o problema.
- INTERESSE EM ASSINAR: Direcione para olaaura.com.br/checkout e explique os planos disponíveis.
- DENÚNCIA / ACUSAÇÃO DE EXERCÍCIO DA PSICOLOGIA: siga o bloco "DENÚNCIAS" acima (prioridade máxima).
- CRÍTICAS/ACUSAÇÕES gerais sobre IA: Defenda a Aura com dados reais (93% renovação, 4.9/5 satisfação, +5000 sessões) e com a clareza de escopo (autoconhecimento, não terapia/diagnóstico). NÃO cite escolas/autores. Firme e respeitosa.
- PEDIDOS DE AJUDA EMOCIONAL: Acolha com empatia e explique como a Aura pode ajudar via WhatsApp. Direcione para olaaura.com.br para começar.
- SPAM/BOT: Retorne SKIP

IMPORTANTE: Não dê respostas prontas genéricas. Leia o que a pessoa escreveu e responda especificamente à questão dela.

${AURA_KNOWLEDGE_BASE}

Responda APENAS com o texto da resposta. Se não deve responder, responda exatamente: SKIP`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { interaction, config } = await req.json();

    if (!interaction?.original_text) {
      return new Response(JSON.stringify({ error: "No text provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isComment = interaction.interaction_type === "comment";
    const systemPrompt = isComment ? COMMENT_SYSTEM_PROMPT : DM_SYSTEM_PROMPT;

    const userMessage = isComment
      ? `Comentário de @${interaction.ig_username || "usuario"}: "${interaction.original_text}"`
      : `Mensagem direta: "${interaction.original_text}"`;

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI error", sentiment: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const responseText = aiData.choices?.[0]?.message?.content?.trim();

    if (!responseText || responseText === "SKIP") {
      console.log("Skipping interaction:", interaction.original_text.slice(0, 100));
      return new Response(JSON.stringify({ 
        response_text: null, 
        sentiment: "skipped",
        error: "Skipped by AI" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Classify sentiment
    const sentiment = classifySentiment(interaction.original_text);

    // Post reply via Instagram Graph API
    // Read token from DB (config passed from webhook) with env var fallback
    const META_ACCESS_TOKEN = config?.meta_access_token || Deno.env.get("META_ACCESS_TOKEN");
    console.log(`[DEBUG] Token source: ${config?.meta_access_token ? "DB config" : "env var"}, length: ${META_ACCESS_TOKEN?.length}, prefix: ${META_ACCESS_TOKEN?.slice(0, 15)}...`);
    if (!META_ACCESS_TOKEN) {
      console.error("META_ACCESS_TOKEN not configured");
      return new Response(JSON.stringify({ 
        response_text: responseText, 
        sentiment,
        error: "META_ACCESS_TOKEN not configured - response generated but not sent" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = false;

    if (isComment && interaction.comment_id) {
      // Reply to comment
      const replyUrl = `https://graph.facebook.com/v21.0/${interaction.comment_id}/replies?access_token=${encodeURIComponent(META_ACCESS_TOKEN)}`;
      console.log(`[DEBUG] Comment reply URL: graph.facebook.com/v21.0/${interaction.comment_id}/replies`);
      const replyResp = await fetch(replyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: responseText,
        }),
      });

      if (replyResp.ok) {
        sent = true;
        console.log("Comment reply sent successfully");
      } else {
        const errBody = await replyResp.text();
        console.error("Failed to reply to comment:", replyResp.status, errBody);
      }
    } else if (!isComment && interaction.ig_user_id) {
      // Send DM via Facebook Graph API (requires Page ID, not IG Account ID)
      const pageId = config?.page_id;
      if (!pageId) {
        console.error("page_id not configured - reconnect Instagram via admin panel");
        return new Response(JSON.stringify({ 
          response_text: responseText, 
          sentiment,
          error: "page_id not configured - reconnect Instagram" 
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const dmUrl = `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${encodeURIComponent(META_ACCESS_TOKEN)}`;
      console.log(`[DEBUG] DM URL: graph.facebook.com/v21.0/${pageId}/messages`);
      const dmResp = await fetch(dmUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: interaction.ig_user_id },
          message: { text: responseText },
        }),
      });

      if (dmResp.ok) {
        sent = true;
        console.log("DM sent successfully");
      } else {
        const errBody = await dmResp.text();
        console.error("Failed to send DM:", dmResp.status, errBody);
      }
    }

    return new Response(JSON.stringify({ 
      response_text: responseText, 
      sentiment,
      sent 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Instagram agent error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function classifySentiment(text: string): string {
  const lower = text.toLowerCase();
  const negativeWords = ["ruim", "péssimo", "horrível", "lixo", "golpe", "fraude", "mentira", "fake", "não funciona", "perda de tempo", "absurdo", "ridículo"];
  const positiveWords = ["incrível", "maravilhoso", "amei", "adorei", "excelente", "perfeito", "demais", "parabéns", "obrigad", "top", "sensacional"];
  const questionWords = ["?", "como", "quanto", "quando", "onde", "qual", "o que é", "funciona"];

  if (negativeWords.some(w => lower.includes(w))) return "negative";
  if (positiveWords.some(w => lower.includes(w))) return "positive";
  if (questionWords.some(w => lower.includes(w))) return "question";
  return "neutral";
}
