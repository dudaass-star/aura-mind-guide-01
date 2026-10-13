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
import { PreviewPlayer } from "@/components/degustacao/PreviewPlayer";
import meditationImage from "@/assets/meditation-storm.jpg";
import sessionImage from "@/assets/meditation-presence.jpg";

const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const gifts = [
  { image: sessionImage, icon: MessageCircleHeart, badge: "Texto ou áudio", title: "Sessão guiada de 45 minutos", body: "Um encontro completo e profundo com a AURA para organizar pensamentos e clarear o que está pesando." },
  { image: prayerImage, icon: HeartHandshake, badge: "Voz acolhedora", title: "Uma oração narrada", body: "Para os momentos em que você quer silenciar e se aproximar de Deus." },
  { image: meditationImage, icon: Headphones, badge: "Respiração e calma", title: "Uma meditação guiada", body: "Para desacelerar o corpo e aliviar o ritmo acelerado da mente." },
];

const pillars = [
  { title: "Você no seu ritmo", body: "Fale por áudio ou digite, sem pressa." },
  { title: "Escuta de verdade", body: "A AURA conecta o que você conta, sem respostas genéricas." },
  { title: "Livre para decidir", body: "Viva a experiência completa antes de pensar em qualquer plano." },
];

function CtaButton() {
  return (
    <div className="mt-8 flex justify-center">
      <Button size="lg" onClick={() => document.getElementById("cadastro")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
        Quero meu encontro gratuito
      </Button>
    </div>
  );
}

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
    <div className="theme-v2 deg-hero-bg min-h-dvh bg-background text-foreground">
      <Helmet>
        <title>Experimente grátis a Olá Aura | Sessão guiada de 45 minutos</title>
        <meta name="description" content="Faça grátis uma sessão guiada de 45 minutos com a AURA, uma oração e uma meditação. Sem cartão." />
      </Helmet>
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <img src={logoOlaAura} alt="Olá Aura" className="h-8 w-auto" />
        <Link to="/meu-espaco/entrar" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Já tenho acesso</Link>
      </header>

      <main className="container mx-auto grid max-w-6xl gap-10 px-6 pb-12 pt-6 md:grid-cols-[1.1fr_1fr] md:items-center md:pt-12">
        <section>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-primary">Degustação gratuita · Sem cartão de crédito</p>
          <h1 className="font-display text-4xl font-medium leading-[1.08] tracking-tight md:text-6xl">
            O que você está sentindo não precisa esperar.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-foreground/75">
            Experimente um encontro guiado com a AURA — ela escuta, conecta o que você conta e ajuda você a enxergar o próximo passo.
          </p>
        </section>

        <section id="cadastro" className="scroll-mt-6 rounded-2xl border border-border bg-card p-6 shadow-xl md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <img src={avatarAura} alt="AURA" className="h-12 w-12 rounded-full object-cover" />
            <div><p className="font-semibold">Libere seu encontro gratuito</p><p className="text-sm text-muted-foreground">Leva menos de um minuto</p></div>
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
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Quero meu encontro gratuito
            </Button>
          </form>
          <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />Não pedimos dados de cartão</li>
            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />Acesso liberado direto no App</li>
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Conversa sigilosa e privada</li>
          </ul>
          <p className="mt-6 text-xs text-muted-foreground">A AURA não substitui acompanhamento psicológico ou médico. Em risco imediato, ligue 188 (CVV) ou 192.</p>
        </section>
      </main>

      <section className="container mx-auto max-w-3xl px-6 pb-14">
        <h2 className="font-display text-2xl font-medium md:text-3xl">Ouça uma prévia</h2>
        <p className="mt-2 text-foreground/70">Um trecho de oração e de meditação, do jeito que você vai ouvir no App.</p>
        <div className="mt-6"><PreviewPlayer /></div>
        <CtaButton />
      </section>

      <section className="container mx-auto max-w-6xl px-6 pb-14">
        <h2 className="font-display text-2xl font-medium md:text-3xl">O que está liberado para você</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {gifts.map((g) => (
            <li key={g.title} className="overflow-hidden rounded-xl border border-border bg-card shadow-md">
              <div className="relative h-32">
                <img src={g.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                <span className="absolute -bottom-5 left-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-4 ring-card"><g.icon className="h-4 w-4" /></span>
              </div>
              <div className="p-5 pt-7">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">{g.badge}</span>
                <p className="mt-1 font-display text-lg font-medium leading-snug">{g.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/70">{g.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <CtaButton />
      </section>
      <section className="container mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-4 md:grid-cols-3">
          {pillars.map((p, i) => (
            <div key={p.title} className="rounded-xl border border-border bg-card p-6">
              <span className="text-sm font-semibold text-primary">0{i + 1}</span>
              <p className="mt-2 font-semibold">{p.title}</p>
              <p className="mt-1 text-sm text-foreground/70">{p.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
