// ============================================================================
// blog-sitemap
// ----------------------------------------------------------------------------
// Retorna sitemap XML dinâmico com TODAS as rotas públicas + posts publicados.
// Acessível em /functions/v1/blog-sitemap. O robots.txt aponta pra essa URL.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://olaaura.com.br";

const STATIC_ROUTES: { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/v2", changefreq: "weekly", priority: "1.0" },
  { path: "/guia", changefreq: "monthly", priority: "0.6" },
  { path: "/blog", changefreq: "daily", priority: "0.9" },
  { path: "/termos", changefreq: "yearly", priority: "0.3" },
  { path: "/privacidade", changefreq: "yearly", priority: "0.3" },
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("slug, updated_at, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const r of STATIC_ROUTES) {
    lines.push(
      `  <url><loc>${SITE}${r.path}</loc><lastmod>${today}</lastmod><changefreq>${r.changefreq}</changefreq><priority>${r.priority}</priority></url>`,
    );
  }

  for (const p of posts || []) {
    const lastmod = (p.updated_at || p.published_at || today).slice(0, 10);
    lines.push(
      `  <url><loc>${SITE}/blog/${esc(p.slug)}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`,
    );
  }

  lines.push("</urlset>");

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
});