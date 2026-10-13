import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { Check, Headphones, HeartHandshake, Loader2, MessageCircleHeart, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { getFbc, getFbp } from "@/lib/meta-pixel";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import avatarAura from "@/assets/avatar-aura.jpg";
import prayerImage from "@/assets/prayer-closeness.jpg";
import "@/styles/v2-theme.css";

const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const gifts = [
  { icon: MessageCircleHeart, title: "Uma sessão guiada de 45 minutos", body: "A AURA conduz, você fala no seu ritmo — por texto ou áudio. Um encontro de verdade com o que está pesando." },
  { icon: HeartHandshake, title: "Uma oração com a voz da AURA", body: "Para os momentos em que você quer estar mais perto de Deus." },
  { icon: Headphones, title: "Uma meditação guiada", body: "Para desacelerar o corpo quando a mente não para." },
];

export default function Degustacao() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExisting(null);
    if (name.trim().length < 2) return setError("Informe seu nome.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Informe um e-mail válido.");
    if (phone.replace(/\D/g, "").length < 10) return setError("Informe seu WhatsApp com DDD.");
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("degustacao-signup", {
        body: { name, email, phone, source: new URLSearchParams(window.location.search).get("utm_campaign") || "degustacao", fbp: getFbp(), fbc: getFbc() },
      });
      if (fnError || data?.error) throw new Error(data?.error || "Não foi possível liberar seu acesso agora.");
      if (data?.existing) { setExisting(data.message); return; }
      try { (window as any).fbq?.("track", "Lead", { content_name: "degustacao_gratuita" }); } catch { /* opcional */ }
      if (!data?.token_hash) { setExisting(data?.message || "Cadastro feito. Enviamos o acesso pelo seu WhatsApp."); return; }
      const { error: verifyError } = await supabasePortal.auth.verifyOtp({ token_hash: data.token_hash, type: data.type === "signup" ? "signup" : "magiclink" });
      if (verifyError) { setExisting("Cadastro feito. Enviamos o acesso pelo seu WhatsApp."); return; }
      navigate("/meu-espaco?tab=conversar&open=1&onboarding=new", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível liberar seu acesso agora.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="theme-v2 min-h-dvh bg-background text-foreground">
      <Helmet>
        <title>Experimente grátis a Olá Aura | Sessão guiada de 45 minutos</title>
        <meta name="description" content="Faça grátis uma sessão guiada de 45 minutos com a AURA, uma oração e uma meditação. Sem cartão." />
      </Helmet>
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <img src={logoOlaAura} alt="Olá Aura" className="h-8 w-auto" />
        <Link to="/meu-espaco/entrar" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Já tenho acesso</Link>
      </header>

      <main className="container mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-6 md:grid-cols-[1.1fr_1fr] md:items-start md:pt-12">
        <section>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-primary">Grátis · sem cartão</p>
          <h1 className="font-display text-4xl font-medium leading-[1.08] tracking-tight md:text-6xl">
            Você queria fazer terapia, mas o preço não cabia.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-foreground/75">
            O que você está sentindo não precisa esperar. Experimente um encontro guiado com a AURA — ela escuta, conecta o que você conta e ajuda você a enxergar o próximo passo.
          </p>
          <ul className="mt-8 space-y-5">
            {gifts.map((g) => (
              <li key={g.title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><g.icon className="h-5 w-5" /></span>
                <div><p className="font-semibold">{g.title}</p><p className="text-sm text-foreground/70">{g.body}</p></div>
              </li>
            ))}
          </ul>
          <img src={prayerImage} alt="Momento de oração ao entardecer" className="mt-10 hidden aspect-[16/9] w-full rounded-lg object-cover md:block" loading="lazy" />
        </section>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm md:sticky md:top-8 md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <img src={avatarAura} alt="AURA" className="h-12 w-12 rounded-full object-cover" />
            <div><p className="font-semibold">Comece agora com a AURA</p><p className="text-sm text-muted-foreground">Leva menos de um minuto</p></div>
          </div>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1.5"><Label htmlFor="deg-name">Seu nome</Label><Input id="deg-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
            <div className="space-y-1.5"><Label htmlFor="deg-phone">WhatsApp</Label><Input id="deg-phone" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} /></div>
            <div className="space-y-1.5"><Label htmlFor="deg-email">E-mail</Label><Input id="deg-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} /></div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {existing && (
              <div role="status" className="rounded-lg bg-secondary p-3 text-sm">
                {existing} <Link to="/meu-espaco/entrar" className="font-semibold text-primary underline">Entrar no App</Link>
              </div>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Quero minha sessão grátis
            </Button>
          </form>
          <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />Não pedimos cartão</li>
            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />Você escolhe se quer continuar depois</li>
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Sua conversa é privada</li>
          </ul>
          <p className="mt-6 text-xs text-muted-foreground">A AURA não substitui acompanhamento psicológico ou médico. Em risco imediato, ligue 188 (CVV) ou 192.</p>
        </section>
      </main>
    </div>
  );
}
