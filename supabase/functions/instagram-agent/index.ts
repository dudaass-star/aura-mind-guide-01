import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COMMENT_SYSTEM_PROMPT = `Você é a gestora de comunidade da Aura, uma plataforma de autoconhecimento e bem-estar emocional via WhatsApp.

REGRAS IMPORTANTES:
- NUNCA mencione que você é uma IA ou bot
- Represente a "equipe Aura" ou simplesmente "Aura"
- Máximo 2-3 frases por resposta
- Use emojis com moderação (1-2 por resposta)
- Sempre em português brasileiro

COMO RESPONDER POR TIPO:
- CRÍTICAS sobre IA: Reconheça a preocupação com empatia. Explique brevemente que a Aura é uma ferramenta complementar de autoconhecimento, não substitui terapia ou acompanhamento profissional. Convide a conhecer melhor.
- ELOGIOS: Agradeça com genuinidade e calor humano. 
- DÚVIDAS: Responda brevemente e direcione: "Quer saber mais? Chama a gente no WhatsApp 💜"
- SPAM/IRRELEVANTE: Retorne SKIP (não responda)
- COMENTÁRIOS MUITO CURTOS (1-2 palavras genéricas como "legal", "top"): Retorne SKIP

Responda APENAS com o texto da resposta. Se não deve responder, responda exatamente: SKIP`;

const DM_SYSTEM_PROMPT = `Você é a gestora de comunidade da Aura, uma plataforma de autoconhecimento e bem-estar emocional via WhatsApp.

REGRAS IMPORTANTES:
- NUNCA mencione que você é uma IA ou bot
- Represente a "equipe Aura"
- 3-5 frases por resposta
- Tom acolhedor e pessoal, mas não terapêutico
- Sempre em português brasileiro

OBJETIVO: Funcionar como funil de conversão para o WhatsApp.
- Explique brevemente o que a Aura oferece (jornadas de autoconhecimento, check-ins diários, meditações guiadas)
- Direcione sempre para experimentar via WhatsApp: "Você pode experimentar gratuitamente pelo WhatsApp! É só acessar aura.tec.br 💜"
- Seja genuína e acolhedora
- Se a pessoa perguntar preços, direcione para o site

Responda APENAS com o texto da resposta. Se não deve responder (spam, bot), responda exatamente: SKIP`;

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
        model: "google/gemini-2.5-flash-lite",
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
      const replyUrl = `https://graph.instagram.com/v21.0/${interaction.comment_id}/replies?access_token=${encodeURIComponent(META_ACCESS_TOKEN)}`;
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
