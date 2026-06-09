import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, ArrowRight } from "lucide-react";

type Cluster = { id: string; slug: string; name: string; cta_copy: string };
type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover_url: string | null;
  cover_alt: string | null;
  reading_minutes: number;
  published_at: string | null;
  cluster_id: string | null;
};

const Blog = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCluster = searchParams.get("cluster") || "todos";

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from("blog_clusters").select("id, slug, name, cta_copy").order("display_order"),
        supabase
          .from("blog_posts")
          .select("id, slug, title, excerpt, cover_url, cover_alt, reading_minutes, published_at, cluster_id")
          .eq("status", "published")
          .order("published_at", { ascending: false }),
      ]);
      if (!active) return;
      setClusters((c || []) as Cluster[]);
      setPosts((p || []) as Post[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (activeCluster === "todos") return posts;
    const cl = clusters.find((c) => c.slug === activeCluster);
    if (!cl) return posts;
    return posts.filter((p) => p.cluster_id === cl.id);
  }, [posts, clusters, activeCluster]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Helmet>
        <title>Blog Aura — Ansiedade, sono, vazio e relacionamentos</title>
        <meta
          name="description"
          content="Textos práticos sobre ansiedade, insônia, vazio emocional, dores de relacionamento e performance. Sem firula, sem moralismo, com passos pra hoje."
        />
        <link rel="canonical" href="https://olaaura.com.br/blog" />
        <meta property="og:title" content="Blog Aura" />
        <meta property="og:description" content="Textos práticos pra atravessar momentos difíceis." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://olaaura.com.br/blog" />
      </Helmet>

      <Header />

      <main className="flex-1 pt-24 pb-20">
        <div className="container mx-auto px-4">
          <header className="max-w-3xl mx-auto text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Blog Aura</h1>
            <p className="text-lg text-muted-foreground">
              Textos práticos pra atravessar ansiedade, insônia, vazio e dores que ninguém vê.
            </p>
          </header>

          {/* Filtros por cluster */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            <button
              onClick={() => setSearchParams({})}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                activeCluster === "todos"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Todos
            </button>
            {clusters.map((c) => (
              <button
                key={c.id}
                onClick={() => setSearchParams({ cluster: c.slug })}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  activeCluster === c.slug
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading && (
              <p className="col-span-full text-center text-muted-foreground">Carregando…</p>
            )}
            {!loading && filtered.length === 0 && (
              <p className="col-span-full text-center text-muted-foreground">
                Em breve — os primeiros posts estão sendo escritos.
              </p>
            )}
            {filtered.map((p) => {
              const cluster = clusters.find((c) => c.id === p.cluster_id);
              return (
                <Link
                  key={p.id}
                  to={`/blog/${p.slug}`}
                  className="group block rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg transition"
                >
                  {p.cover_url ? (
                    <img
                      src={p.cover_url}
                      alt={p.cover_alt || p.title}
                      loading="lazy"
                      className="w-full aspect-[1200/630] object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-[1200/630] bg-gradient-to-br from-primary/10 to-primary/30" />
                  )}
                  <div className="p-5">
                    {cluster && (
                      <Badge variant="secondary" className="mb-3">
                        {cluster.name}
                      </Badge>
                    )}
                    <h2 className="text-lg font-semibold text-foreground group-hover:text-primary transition mb-2 line-clamp-2">
                      {p.title}
                    </h2>
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{p.excerpt}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {p.reading_minutes} min de leitura
                    </div>
                  </div>
                </Link>
              );
            })}

            {/* Card CTA */}
            {!loading && filtered.length > 0 && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Quer falar com alguém agora?
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    A Aura tá no seu WhatsApp 24/7. Acompanhamento emocional contínuo, R$ 6,90 nos
                    7 primeiros dias.
                  </p>
                </div>
                <Button asChild className="w-full">
                  <Link to="/v2">
                    Conhecer a Aura <ArrowRight className="ml-2 w-4 h-4" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Blog;
