// ============================================================================
// generate-sitemap.ts
// ----------------------------------------------------------------------------
// Roda em predev/prebuild. Consulta blog_posts (published) + blog_clusters
// e escreve public/sitemap.xml com BASE_URL=https://olaaura.com.br.
// Sem dependência: usa fetch direto na REST do Supabase com a anon key.
// ============================================================================

import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://olaaura.com.br";
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || "https://uhyogifgmutfmbyhzzyo.supabase.co";
const SUPABASE_ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoeW9naWZnbXV0Zm1ieWh6enlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMzQ2NTQsImV4cCI6MjA4MjYxMDY1NH0.kcwdkvOfU8gnjlcZT8eMPHw3C8YLDMs4DokLyfRveKA";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: string;
}

async function fetchPosts(): Promise<
  { slug: string; published_at: string | null; updated_at: string | null }[]
> {
  const url = `${SUPABASE_URL}/rest/v1/blog_posts?select=slug,published_at,updated_at&status=eq.published&order=published_at.desc`;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
    });
    if (!res.ok) {
      console.warn(`[sitemap] posts fetch falhou: ${res.status}`);
      return [];
    }
    return await res.json();
  } catch (e) {
    console.warn(`[sitemap] posts fetch erro: ${String(e).slice(0, 200)}`);
    return [];
  }
}

async function fetchClusters(): Promise<{ slug: string }[]> {
  const url = `${SUPABASE_URL}/rest/v1/blog_clusters?select=slug&order=display_order`;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
    });
    if (!res.ok) {
      console.warn(`[sitemap] clusters fetch falhou: ${res.status}`);
      return [];
    }
    return await res.json();
  } catch (e) {
    console.warn(`[sitemap] clusters fetch erro: ${String(e).slice(0, 200)}`);
    return [];
  }
}

function build(entries: SitemapEntry[]): string {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
    ``,
  ].join("\n");
}

async function main() {
  const [posts, clusters] = await Promise.all([fetchPosts(), fetchClusters()]);

  const entries: SitemapEntry[] = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/v2", changefreq: "weekly", priority: "0.9" },
    { path: "/blog", changefreq: "daily", priority: "0.8" },
  ];

  for (const c of clusters) {
    entries.push({
      path: `/blog?cluster=${c.slug}`,
      changefreq: "weekly",
      priority: "0.6",
    });
  }

  for (const p of posts) {
    const lastmod = (p.updated_at || p.published_at || "").slice(0, 10);
    entries.push({
      path: `/blog/${p.slug}`,
      lastmod: lastmod || undefined,
      changefreq: "monthly",
      priority: "0.7",
    });
  }

  writeFileSync(resolve("public/sitemap.xml"), build(entries));
  console.log(
    `[sitemap] ${entries.length} entries (${posts.length} posts, ${clusters.length} clusters)`,
  );
}

main().catch((e) => {
  console.error("[sitemap] erro fatal:", e);
  // Não falha o build: gera sitemap mínimo
  writeFileSync(
    resolve("public/sitemap.xml"),
    build([
      { path: "/", changefreq: "weekly", priority: "1.0" },
      { path: "/v2", changefreq: "weekly", priority: "0.9" },
      { path: "/blog", changefreq: "daily", priority: "0.8" },
    ]),
  );
});