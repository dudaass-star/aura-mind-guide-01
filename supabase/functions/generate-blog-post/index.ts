// ============================================================================
// generate-blog-post
// ----------------------------------------------------------------------------
// Cron: ter e sex às 9h BRT (12h UTC). Pega o próximo slot pendente da
// editorial_calendar, gera o post completo via Gemini 2.5 Pro (JSON estruturado),
// valida tamanho/keyword/meta, gera capa OG 1200x630 com Gemini 3.1 flash image,
// faz upload no bucket "blog-covers" (privado, URL assinada de longa duração),
// insere em blog_posts (status=published OU draft se requires_manual_review) e
// atualiza o slot. Se falhar 2x, marca como failed.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const IMAGE_URL = "https://ai.gateway.lovable.dev/v1/images/generations";
const SITE_BASE = "https://olaaura.com.br";
const INDEXNOW_KEY = "f7e3b1c4d8a94e6b9c2f1a3e5d8b7c4a";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

type Slot = {
  id: string;
  cluster_id: string;
  keyword: string;
  proposed_title: string;
  briefing: string;
  is_pillar: boolean;
  requires_manual_review: boolean;
  attempts: number;
};

type Cluster = {
  id: string;
  slug: string;
  name: string;
  cta_copy: string;
};

type GeneratedPost = {
  title: string;
  slug: string;
  excerpt: string;
  meta_title: string;
  meta_description: string;
  cover_alt: string;
  cover_prompt: string;
  tags: string[];
  content_md: string;
  faq: { question: string; answer: string }[];
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function wordCount(md: string): number {
  return md.replace(/[#*`>\-_]/g, " ").split(/\s+/).filter(Boolean).length;
}

// Comparação de keyword ignorando acento/caixa: "insonia" casa com "insônia".
function foldAccents(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function validate(post: GeneratedPost, keyword: string): string | null {
  if (!post.title || post.title.length < 20 || post.title.length > 70)
    return `title fora do range (${post.title?.length})`;
  if (!post.meta_title || post.meta_title.length > 65)
    return `meta_title fora do range (${post.meta_title?.length})`;
  if (!post.meta_description || post.meta_description.length < 110 || post.meta_description.length > 170)
    return `meta_description fora do range (${post.meta_description?.length})`;
  if (!post.content_md || wordCount(post.content_md) < 1200)
    return `content_md muito curto (${wordCount(post.content_md)} palavras)`;
  if (!foldAccents(post.content_md).includes(foldAccents(keyword)))
    return `keyword "${keyword}" ausente no conteúdo`;
  const h2Count = (post.content_md.match(/^##\s/gm) || []).length;
  if (h2Count < 3) return `poucos H2 (${h2Count})`;
  if (!post.faq || post.faq.length < 3) return `FAQ insuficiente`;
  return null;
}

async function pickNextSlot(supabase: any): Promise<Slot | null> {
  const { data, error } = await supabase
    .from("editorial_calendar")
    .select("id, cluster_id, keyword, proposed_title, briefing, is_pillar, requires_manual_review, attempts")
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Slot | null;
}

// ----------------------------------------------------------------------------
// Auto-recuperação: slots que travaram em "generating" (crash/timeout no meio)
// voltam pra fila. Depois de 3 tentativas viram "failed" pra não travar o trem.
// ----------------------------------------------------------------------------
async function recoverStuckSlots(supabase: any): Promise<void> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("editorial_calendar")
    .select("id, attempts")
    .eq("status", "generating")
    .lt("updated_at", cutoff);
  for (const s of data || []) {
    await supabase
      .from("editorial_calendar")
      .update({
        status: (s.attempts ?? 0) >= 3 ? "failed" : "queued",
        error_message: "recuperado de generating travado",
      })
      .eq("id", s.id);
  }
  if ((data || []).length) console.log(`[recover] ${data.length} slot(s) destravado(s)`);
}

// ----------------------------------------------------------------------------
// Auto-planejamento: quando a fila esvazia, a própria função gera os próximos
// slots (keywords + briefings) via IA, evitando repetir keywords já usadas.
// É isso que torna o blog perpétuo — sem depender de alguém popular a agenda.
// ----------------------------------------------------------------------------
type PlannedSlot = { cluster_slug: string; keyword: string; proposed_title: string; briefing: string };

function nextTueFriSlots(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  while (out.length < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow === 2 || dow === 5) out.push(new Date(d).toISOString());
  }
  return out;
}

async function planNextSlots(supabase: any, howMany = 8): Promise<number> {
  const { data: clusters } = await supabase
    .from("blog_clusters")
    .select("id, slug, name, cta_copy")
    .order("display_order");
  if (!clusters?.length) throw new Error("sem clusters para planejar");

  const { data: usedRows } = await supabase
    .from("editorial_calendar")
    .select("keyword")
    .order("created_at", { ascending: false })
    .limit(200);
  const used = (usedRows || []).map((r: any) => r.keyword);

  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Você é estrategista de SEO PT-BR para a Aura (acompanhamento emocional por WhatsApp). Propõe keywords de cauda longa com intenção informacional real, que gente em sofrimento digita no Google.",
        },
        {
          role: "user",
          content: `Planeje ${howMany} próximos posts do blog.

CLUSTERS DISPONÍVEIS (use o slug exato em cluster_slug):
${clusters.map((c: any) => `- ${c.slug}: ${c.name}`).join("\n")}

KEYWORDS JÁ USADAS (não repita nem variações quase idênticas):
${used.join(", ") || "(nenhuma)"}

Regras: distribua entre os clusters, keyword em minúsculas sem acento desnecessário, proposed_title com a keyword, briefing de 2-3 frases dizendo o ângulo e o que o leitor leva pra casa. Responda só JSON.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "editorial_plan",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["slots"],
            properties: {
              slots: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["cluster_slug", "keyword", "proposed_title", "briefing"],
                  properties: {
                    cluster_slug: { type: "string" },
                    keyword: { type: "string" },
                    proposed_title: { type: "string" },
                    briefing: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`planner ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const parsed = JSON.parse((await res.json())?.choices?.[0]?.message?.content || "{}");
  const slots: PlannedSlot[] = parsed?.slots || [];
  if (!slots.length) throw new Error("planner sem slots");

  const dates = nextTueFriSlots(slots.length);
  // O primeiro slot fica disponível agora, pra não esperar o próximo ter/sex.
  dates[0] = new Date(Date.now() - 60_000).toISOString();

  const rows = slots
    .map((s, i) => {
      const cluster = clusters.find((c: any) => c.slug === s.cluster_slug) || clusters[i % clusters.length];
      const kw = (s.keyword || "").trim().toLowerCase();
      if (!kw || used.some((u: string) => u.toLowerCase() === kw)) return null;
      return {
        cluster_id: cluster.id,
        scheduled_for: dates[i],
        keyword: kw,
        proposed_title: s.proposed_title,
        briefing: s.briefing,
        is_pillar: false,
        requires_manual_review: false,
        status: "queued",
      };
    })
    .filter(Boolean);
  if (!rows.length) return 0;

  const { error } = await supabase.from("editorial_calendar").insert(rows);
  if (error) throw error;
  console.log(`[planner] ${rows.length} slot(s) criado(s)`);
  return rows.length;
}

async function generatePost(
  slot: Slot,
  cluster: Cluster,
  recentTitles: string[],
): Promise<GeneratedPost> {
  const system = `Você é redator sênior de SEO em PT-BR para um serviço de acompanhamento emocional via WhatsApp chamado "Aura". Escreve com voz humana, frases curtas, zero firula, sem moralismo, sem chavões de coach. Cita estudos só quando tem repertório real. Nunca promete cura. Aceita que a dor existe e oferece passos práticos. Estrutura SEO impecável: H1 com keyword, resposta direta nos 2 primeiros parágrafos, H2s em formato de pergunta, listas, tabelas quando útil, FAQ no final.`;

  const user = `Gere um post de blog completo em JSON.

CONTEXTO DO CLUSTER:
- Nome: ${cluster.name}
- CTA copy do cluster (use ao final do post): "${cluster.cta_copy}"

TÓPICO:
- Keyword alvo (exata): "${slot.keyword}"
- Título proposto (refine se quiser, mas mantenha a keyword): "${slot.proposed_title}"
- Briefing: ${slot.briefing}

EVITAR (títulos recentes para não repetir tom): ${recentTitles.slice(0, 10).map((t) => `"${t}"`).join(", ") || "(nenhum)"}

REGRAS OBRIGATÓRIAS:
- title: 30-65 caracteres, deve conter a keyword exata
- meta_title: até 60 caracteres, com a keyword
- meta_description: 120-160 caracteres, com a keyword e um gancho concreto
- slug: kebab-case da keyword exata
- excerpt: 1-2 frases (até 200 chars) que dão vontade de clicar
- cover_alt: descrição da capa em uma frase
- cover_prompt: prompt em INGLÊS para gerar imagem 1200x630 com estilo "soft editorial illustration, calm muted palette (soft purples, warm beige, dusty blue), minimal, no text, abstract emotional metaphor, no people faces" — adapte ao tema
- tags: 3 a 5 tags em pt-br
- content_md: Markdown com mínimo 1500 palavras, contendo:
  - H1 ("# ...") com a keyword
  - 2 parágrafos iniciais respondendo a pergunta de forma direta
  - 4-6 H2s ("## ...") em formato de pergunta
  - Listas e/ou tabelas quando ajudar
  - 1 link interno markdown para o cluster (use [texto](/blog?cluster=${cluster.slug}))
  - Antes do fechamento, um CTA inline (parágrafo curto convidando pra Aura)
  - Fechamento humano com a copy do CTA do cluster, terminando com link [Conhecer a Aura](/v2)
- faq: 3-5 perguntas reais com respostas curtas (2-4 frases)

RESPONDA SOMENTE com JSON válido seguindo o schema. Sem comentários, sem markdown wrapper.`;

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["title", "slug", "excerpt", "meta_title", "meta_description", "cover_alt", "cover_prompt", "tags", "content_md", "faq"],
    properties: {
      title: { type: "string" },
      slug: { type: "string" },
      excerpt: { type: "string" },
      meta_title: { type: "string" },
      meta_description: { type: "string" },
      cover_alt: { type: "string" },
      cover_prompt: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      content_md: { type: "string" },
      faq: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "answer"],
          properties: { question: { type: "string" }, answer: { type: "string" } },
        },
      },
    },
  };

  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "blog_post", strict: true, schema },
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`gemini text ${res.status}: ${t.slice(0, 400)}`);
  }
  const j = await res.json();
  const content = j?.choices?.[0]?.message?.content;
  if (!content) throw new Error("gemini sem content");
  return JSON.parse(content) as GeneratedPost;
}

async function generateCover(prompt: string): Promise<Uint8Array> {
  const res = await fetch(IMAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image-preview",
      messages: [{ role: "user", content: `${prompt}. 1200x630 aspect ratio, editorial illustration, no text, no watermark.` }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`image ${res.status}: ${t.slice(0, 400)}`);
  }
  const j = await res.json();
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error("image sem b64");
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function uploadCover(supabase: any, slug: string, bytes: Uint8Array): Promise<string> {
  const path = `${slug}-${Date.now()}.png`;
  const { error: upErr } = await supabase.storage
    .from("blog-covers")
    .upload(path, bytes, { contentType: "image/png", upsert: false });
  if (upErr) throw upErr;
  // Bucket privado: gera URL assinada de longa duração (10 anos)
  const { data, error } = await supabase.storage
    .from("blog-covers")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (error || !data?.signedUrl) throw error || new Error("signed url falhou");
  return data.signedUrl;
}

function buildJsonLd(post: GeneratedPost, coverUrl: string | null, publishedAt: string): any {
  const url = `${SITE_BASE}/blog/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: post.title,
        description: post.meta_description,
        image: coverUrl ? [coverUrl] : undefined,
        datePublished: publishedAt,
        dateModified: publishedAt,
        author: { "@type": "Organization", name: "Equipe Aura", url: SITE_BASE },
        publisher: { "@type": "Organization", name: "Olá Aura", url: SITE_BASE },
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        inLanguage: "pt-BR",
      },
      {
        "@type": "FAQPage",
        mainEntity: post.faq.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      },
    ],
  };
}

// Notifica buscadores quando um post novo é publicado (fire-and-forget)
async function notifySearchEngines(slug: string): Promise<void> {
  const postUrl = `${SITE_BASE}/blog/${slug}`;
  const sitemapUrl = `${SITE_BASE}/sitemap.xml`;

  // Google ping (descontinuado oficialmente em 2023 mas ainda responde — best-effort)
  const googlePing = fetch(
    `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
    { method: "GET" },
  ).catch((e) => console.warn("google ping falhou:", String(e).slice(0, 200)));

  // IndexNow (Bing, Yandex, Seznam, Naver)
  const indexNow = fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: "olaaura.com.br",
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_BASE}/${INDEXNOW_KEY}.txt`,
      urlList: [postUrl, sitemapUrl],
    }),
  }).catch((e) => console.warn("indexnow falhou:", String(e).slice(0, 200)));

  await Promise.allSettled([googlePing, indexNow]);
  console.log(`[search-engines] notificados para ${postUrl}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    await recoverStuckSlots(supabase);

    let slot = await pickNextSlot(supabase);
    if (!slot) {
      // Fila vazia: planeja os próximos posts automaticamente e segue no mesmo run.
      const created = await planNextSlots(supabase);
      if (created > 0) slot = await pickNextSlot(supabase);
    }
    if (!slot) {
      return new Response(JSON.stringify({ ok: true, message: "sem slots pendentes" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // marca em geração
    await supabase
      .from("editorial_calendar")
      .update({ status: "generating", attempts: slot.attempts + 1 })
      .eq("id", slot.id);

    const { data: cluster } = await supabase
      .from("blog_clusters")
      .select("id, slug, name, cta_copy")
      .eq("id", slot.cluster_id)
      .single();
    if (!cluster) throw new Error("cluster não encontrado");

    const { data: recent } = await supabase
      .from("blog_posts")
      .select("title")
      .order("created_at", { ascending: false })
      .limit(30);
    const recentTitles = (recent || []).map((r: any) => r.title);

    // Gera com até 1 retry se validação falhar
    let post: GeneratedPost | null = null;
    let validationError: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      post = await generatePost(slot, cluster, recentTitles);
      validationError = validate(post, slot.keyword);
      if (!validationError) break;
      console.warn(`tentativa ${attempt + 1} falhou validação: ${validationError}`);
    }
    if (!post) throw new Error("geração retornou nulo");

    // Reparo mecânico do que dá pra consertar sem IA (títulos/metas fora de range).
    // Evita post virar draft silencioso por 3 caracteres de excesso.
    if (validationError) {
      if (post.meta_title && post.meta_title.length > 65) post.meta_title = post.meta_title.slice(0, 62).trim() + "…";
      if (post.title && post.title.length > 70) post.title = post.title.slice(0, 67).trim() + "…";
      if (post.meta_description && post.meta_description.length > 170)
        post.meta_description = post.meta_description.slice(0, 167).trim() + "…";
      validationError = validate(post, slot.keyword);
      if (validationError) console.warn(`draft por: ${validationError}`);
    }

    // Normaliza slug
    const safeSlug = slugify(post.slug || post.title);
    post.slug = safeSlug;

    // Garante slug único
    const { data: existing } = await supabase
      .from("blog_posts")
      .select("id")
      .eq("slug", safeSlug)
      .maybeSingle();
    if (existing) post.slug = `${safeSlug}-${Date.now().toString(36)}`;

    // Gera capa (best-effort: se falhar, segue sem capa)
    let coverUrl: string | null = null;
    try {
      const bytes = await generateCover(post.cover_prompt);
      coverUrl = await uploadCover(supabase, post.slug, bytes);
    } catch (e) {
      console.warn("cover falhou:", String(e).slice(0, 200));
    }

    const publishedAt = new Date().toISOString();
    const wc = wordCount(post.content_md);
    const status = slot.requires_manual_review || validationError ? "draft" : "published";
    const jsonLd = buildJsonLd(post, coverUrl, publishedAt);

    const { data: inserted, error: insErr } = await supabase
      .from("blog_posts")
      .insert({
        cluster_id: cluster.id,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        content_md: post.content_md,
        cover_url: coverUrl,
        cover_alt: post.cover_alt,
        tags: post.tags,
        meta_title: post.meta_title,
        meta_description: post.meta_description,
        faq: post.faq,
        json_ld: jsonLd,
        status,
        word_count: wc,
        reading_minutes: Math.max(2, Math.round(wc / 220)),
        is_pillar: slot.is_pillar,
        published_at: status === "published" ? publishedAt : null,
      })
      .select("id, slug, status")
      .single();
    if (insErr) throw insErr;

    await supabase
      .from("editorial_calendar")
      .update({
        status: "done",
        blog_post_id: inserted.id,
        error_message: validationError, // se virou draft por validação
      })
      .eq("id", slot.id);

    // Notifica buscadores se foi publicado (não bloqueia resposta)
    if (inserted.status === "published") {
      await notifySearchEngines(inserted.slug);
    }

    return new Response(
      JSON.stringify({ ok: true, post: inserted, validationError }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-blog-post erro:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});