import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, ChevronLeft } from "lucide-react";

type Cluster = { id: string; slug: string; name: string; cta_copy: string };
type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content_md: string;
  cover_url: string | null;
  cover_alt: string | null;
  meta_title: string;
  meta_description: string;
  faq: { question: string; answer: string }[];
  json_ld: any;
  reading_minutes: number;
  published_at: string | null;
  cluster_id: string | null;
};

const SITE = "https://olaaura.com.br";

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [related, setRelated] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const { data: p } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (!active) return;
      if (!p) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setPost(p as unknown as Post);

      const [{ data: c }, { data: r }] = await Promise.all([
        p.cluster_id
          ? supabase.from("blog_clusters").select("*").eq("id", p.cluster_id).maybeSingle()
          : Promise.resolve({ data: null }),
        p.cluster_id
          ? supabase
              .from("blog_posts")
              .select("id, slug, title, excerpt, cover_url, cover_alt, reading_minutes, published_at, cluster_id")
              .eq("status", "published")
              .eq("cluster_id", p.cluster_id)
              .neq("id", p.id)
              .order("published_at", { ascending: false })
              .limit(3)
          : Promise.resolve({ data: [] }),
      ]);
      if (!active) return;
      setCluster((c as Cluster) || null);
      setRelated((r || []) as unknown as Post[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 pt-24 container mx-auto px-4 text-center text-muted-foreground">
          Carregando…
        </main>
        <Footer />
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 pt-24 container mx-auto px-4 text-center">
          <h1 className="text-3xl font-bold mb-4">Post não encontrado</h1>
          <Button asChild>
            <Link to="/blog">Voltar pro blog</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  const url = `${SITE}/blog/${post.slug}`;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Helmet>
        <title>{post.meta_title}</title>
        <meta name="description" content={post.meta_description} />
        <link rel="canonical" href={url} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.meta_title} />
        <meta property="og:description" content={post.meta_description} />
        <meta property="og:url" content={url} />
        {post.cover_url && <meta property="og:image" content={post.cover_url} />}
        {post.json_ld && (
          <script type="application/ld+json">{JSON.stringify(post.json_ld)}</script>
        )}
      </Helmet>

      <Header />

      <main className="flex-1 pt-24 pb-20">
        <article className="container mx-auto px-4 max-w-3xl">
          <Link
            to="/blog"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
          </Link>

          {cluster && (
            <Link to={`/blog?cluster=${cluster.slug}`}>
              <Badge variant="secondary" className="mb-4">
                {cluster.name}
              </Badge>
            </Link>
          )}

          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4 leading-tight">
            {post.title}
          </h1>

          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8">
            {post.published_at && (
              <time dateTime={post.published_at}>
                {new Date(post.published_at).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </time>
            )}
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" /> {post.reading_minutes} min
            </span>
          </div>

          {post.cover_url && (
            <img
              src={post.cover_url}
              alt={post.cover_alt || post.title}
              className="w-full aspect-[1200/630] object-cover rounded-xl mb-8"
            />
          )}

          <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-a:text-primary prose-strong:text-foreground prose-li:text-foreground/90">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content_md}</ReactMarkdown>
          </div>

          {/* CTA banner final */}
          <div className="mt-12 rounded-xl border border-primary/30 bg-primary/5 p-6 md:p-8 text-center">
            <h3 className="text-xl md:text-2xl font-semibold text-foreground mb-3">
              {cluster?.cta_copy || "Quando precisar conversar, a Aura tá no seu WhatsApp."}
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              Acompanhamento emocional contínuo via WhatsApp. R$ 6,90 nos 7 primeiros dias.
            </p>
            <Button asChild size="lg">
              <Link to="/v2">
                Conhecer a Aura <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
          </div>

          {/* FAQ */}
          {post.faq && post.faq.length > 0 && (
            <section className="mt-14">
              <h2 className="text-2xl font-bold text-foreground mb-6">Perguntas frequentes</h2>
              <div className="space-y-4">
                {post.faq.map((f, i) => (
                  <details key={i} className="group rounded-lg border border-border p-4">
                    <summary className="cursor-pointer font-medium text-foreground">
                      {f.question}
                    </summary>
                    <p className="mt-3 text-sm text-muted-foreground">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* Posts relacionados */}
          {related.length > 0 && (
            <section className="mt-16">
              <h2 className="text-2xl font-bold text-foreground mb-6">Continue lendo</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    to={`/blog/${r.slug}`}
                    className="block rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg transition"
                  >
                    {r.cover_url ? (
                      <img
                        src={r.cover_url}
                        alt={r.cover_alt || r.title}
                        loading="lazy"
                        className="w-full aspect-[1200/630] object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-[1200/630] bg-gradient-to-br from-primary/10 to-primary/30" />
                    )}
                    <div className="p-4">
                      <h3 className="font-semibold text-foreground line-clamp-2">{r.title}</h3>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>
      </main>

      <Footer />
    </div>
  );
};

export default BlogPost;