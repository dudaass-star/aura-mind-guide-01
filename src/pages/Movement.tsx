import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarDays, Check, CheckCheck, Gift, HeartHandshake, MessageCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoOlaAura from "@/assets/logo-ola-aura-horizontal.png";
import movementGroupImage from "@/assets/movimento-grupo-abraco-logo-real.jpg";
import avatarAura from "@/assets/avatar-aura.jpg";
import { recordMovementReach } from "@/lib/movement";
import { trackMovement, useMovementVisibility } from "@/lib/movement-analytics";
import { supabasePortal } from "@/integrations/supabase/portal-client";

export default function Movement() {
  const trackingRef = useMovementVisibility("public", true, "public_viewed");
  const [params] = useSearchParams();
  const [sharedBy, setSharedBy] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{ members: number; started: number; continued: number; mural: Array<{ id: string; title: string; body: string; member_name: string }> } | null>(null);
  const code = params.get("por");
  // Visitante sem conta vive primeiro o encontro gratuito; quem já tem conta vai direto ao convite.
  const [hasSession, setHasSession] = useState(false);
  const invited = Boolean(code) && !hasSession;
  const startHref = code ? `/degustacao?por=${code}` : "/degustacao";
  const giftHref = hasSession ? "/movimento/area?papel=embaixador" : code ? `/degustacao?por=${code}` : "/degustacao";

  useEffect(() => {
    void supabasePortal.auth.getSession().then(({ data }) => setHasSession(Boolean(data.session)));
  }, []);

  useEffect(() => {
    if (code) void recordMovementReach(code).then((result) => setSharedBy(result?.shared_by || null));
    void supabasePortal.functions.invoke("movement-public", { body: { action: "snapshot" } }).then(({ data }) => setSnapshot(data?.result || null));
  }, [code]);

  return <div ref={trackingRef} className="movement-theme min-h-screen bg-background text-foreground">
    <Helmet><title>Movimento Olá Aura — Presenteie alguém com um encontro gratuito</title><meta name="description" content="Presenteie quem você ama com um primeiro encontro gratuito de 45 minutos com a Aura, direto pelo WhatsApp." /><meta property="og:title" content="Movimento Olá Aura" /><meta property="og:description" content="Presenteie quem você ama com um encontro gratuito de 45 minutos com a Aura." /><meta property="og:type" content="website" /><meta name="twitter:card" content="summary_large_image" /></Helmet>
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8"><Link to="/"><img src={logoOlaAura} alt="Olá Aura" className="h-8 w-auto brightness-0 invert sm:h-9" /></Link><Button asChild variant="secondary" size="sm">{invited ? <Link to={startHref} onClick={() => trackMovement("join_cta_clicked", "public", { place: "header_invited" })}>Receber meu presente</Link> : <Link to={giftHref} onClick={() => trackMovement("join_cta_clicked", "public", { place: "header" })}>Presentear alguém</Link>}</Button></div>
    </header>

    <main>
      <section className="relative min-h-[calc(100svh-1.5rem)] overflow-hidden bg-foreground text-primary-foreground md:min-h-[680px]">
        <img src={movementGroupImage} alt="Mulheres reunidas em um abraço com camisetas da Olá Aura" width={1600} height={1008} className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground via-foreground/65 to-foreground/20 md:bg-gradient-to-r md:from-foreground md:via-foreground/80 md:to-foreground/15" />
        <div className="relative mx-auto flex min-h-[calc(100svh-1.5rem)] max-w-7xl items-end px-5 pb-10 pt-28 sm:px-8 md:min-h-[680px] md:items-center"><div className="max-w-2xl"><p className="text-xs font-bold uppercase text-primary-foreground/70">Movimento Olá Aura</p>{invited ? <><h1 className="mt-4 font-display text-[2.4rem] font-semibold leading-[1.05] sm:text-6xl">{sharedBy ? `${sharedBy} te deu um presente.` : "Alguém que gosta de você te deu um presente."}</h1><p className="mt-4 max-w-xl text-base leading-relaxed text-primary-foreground/85 md:text-lg">Um encontro gratuito de 45 minutos com a Aura, para desabafar, organizar os pensamentos e encontrar direção.</p><div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button asChild size="lg" variant="secondary"><Link to={startHref} onClick={() => trackMovement("join_cta_clicked", "public", { place: "hero_invited" })}><Gift /> Receber meu encontro gratuito</Link></Button></div><p className="mt-3 text-xs text-primary-foreground/70">Leva menos de 1 minuto: nome, e-mail e WhatsApp.</p></> : <><h1 className="mt-4 font-display text-[2.4rem] font-semibold leading-[1.05] sm:text-6xl">Sabe aquela pessoa que está passando por um momento difícil?</h1><p className="mt-4 max-w-xl text-base leading-relaxed text-primary-foreground/85 md:text-lg">Você pode presentear ela com um primeiro encontro gratuito de 45 minutos com a Aura.</p><div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button asChild size="lg" variant="secondary"><Link to={giftHref} onClick={() => trackMovement("join_cta_clicked", "public", { place: "hero" })}><Gift /> Quero presentear alguém</Link></Button><Button asChild size="lg" variant="outline" className="border-primary-foreground/35 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"><Link to={startHref}>Quero o meu encontro gratuito</Link></Button></div></>}</div></div>
      </section>

      <section className="py-20"><div className="mx-auto max-w-5xl px-5 sm:px-8"><p className="text-xs font-bold uppercase text-primary">Como funciona</p><h2 className="mt-4 font-display text-4xl font-semibold leading-tight">Um gesto simples, que pode chegar na hora certa.</h2><div className="mt-10 grid gap-4 sm:grid-cols-3">{[{ icon: HeartHandshake, t: "Lembre de alguém", d: "Uma amiga, mãe, irmã ou alguém que está carregando muita coisa sozinha." }, { icon: MessageCircle, t: "Envie pelo WhatsApp", d: "Uma mensagem pessoal e carinhosa, já pronta, com o seu convite." }, { icon: CalendarDays, t: "Ela recebe o encontro", d: "45 minutos com a Aura para conversar, entender o que sente e encontrar direção." }].map(({ icon: Icon, t, d }, i) => <div key={t} className="rounded-xl border border-border bg-card p-6"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground"><Icon className="h-5 w-5" /></span><p className="mt-4 text-xs font-bold text-primary">Passo {i + 1}</p><h3 className="mt-1 font-display text-xl font-semibold">{t}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d}</p></div>)}</div></div></section>

      <section className="border-y border-border bg-secondary/45 py-20"><div className="mx-auto grid max-w-6xl items-center gap-10 px-5 sm:px-8 md:grid-cols-[1fr_.9fr]"><div><p className="text-xs font-bold uppercase text-primary">O que ela vai receber</p><h2 className="mt-4 font-display text-3xl font-semibold leading-tight sm:text-4xl">Um espaço para ser ouvida de verdade.</h2><p className="mt-4 text-lg leading-relaxed text-muted-foreground">A Aura acompanha por texto e áudio, com encontros guiados que ajudam a entender o que está acontecendo e a dar o próximo passo.</p><ul className="mt-6 space-y-3 text-sm font-semibold">{["Encontro de 45 minutos, gratuito", "Sem cartão e sem compromisso", "No celular, no tempo dela"].map((x) => <li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />{x}</li>)}</ul></div><div className="portal-chat-theme mx-auto w-full max-w-sm overflow-hidden rounded-lg border border-border bg-background shadow-lg"><div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3"><img src={avatarAura} alt="AURA" className="h-10 w-10 rounded-full object-cover" /><div><p className="font-semibold">AURA</p><p className="text-xs text-primary">disponível</p></div></div><div className="space-y-3 bg-secondary/45 p-4 text-sm"><div className="ml-auto max-w-[84%] rounded-xl rounded-br-sm bg-primary px-3 py-2.5 text-primary-foreground">Eu sei que preciso decidir, mas continuo duvidando de mim.</div><div className="max-w-[90%] rounded-xl rounded-bl-sm border border-border bg-card px-3 py-2.5 leading-relaxed">Talvez não seja só o medo de escolher errado. O que essa decisão faria você precisar assumir sobre o que realmente quer?</div><div className="flex justify-end gap-1 text-[10px] text-muted-foreground"><span>agora</span><CheckCheck className="h-3 w-3 text-primary" /></div></div></div></div></section>

      {snapshot && snapshot.members >= 10 && <section className="bg-foreground py-16 text-primary-foreground"><div className="mx-auto grid max-w-6xl gap-8 px-5 text-center sm:grid-cols-3 sm:px-8"><div><p className="font-display text-4xl">{snapshot.members}</p><p className="mt-2 text-sm text-primary-foreground/60">pessoas no Movimento</p></div><div><p className="font-display text-4xl">{snapshot.started}</p><p className="mt-2 text-sm text-primary-foreground/60">receberam um primeiro encontro</p></div><div><p className="font-display text-4xl">{snapshot.continued}</p><p className="mt-2 text-sm text-primary-foreground/60">seguiram cuidando de si</p></div></div></section>}

      {snapshot?.mural && snapshot.mural.length > 0 && <section className="py-20"><div className="mx-auto max-w-6xl px-5 sm:px-8"><p className="text-xs font-bold uppercase text-primary">Mural do Movimento</p><h2 className="mt-4 font-display text-4xl font-semibold">Histórias de quem levou esse cuidado adiante.</h2><div className="mt-8 grid gap-4 md:grid-cols-3">{snapshot.mural.map((item) => <article key={item.id} className="rounded-lg border border-border p-5"><p className="text-xs font-bold text-primary">{item.member_name}</p><h3 className="mt-3 font-display text-xl font-semibold">{item.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p></article>)}</div></div></section>}

      <section className="border-t border-border py-20 text-center"><div className="mx-auto max-w-2xl px-5"><Users className="mx-auto h-7 w-7 text-primary" /><h2 className="mt-5 font-display text-4xl font-semibold">Ninguém deveria enfrentar tudo sozinho.</h2><p className="mt-4 text-lg text-muted-foreground">Sem metas, sem comissão, sem ranking. Só pessoas cuidando de pessoas.</p><Button asChild size="lg" className="mt-7"><Link to={giftHref} onClick={() => trackMovement("join_cta_clicked", "public", { place: "footer" })}><Gift /> Quero presentear alguém <ArrowRight /></Link></Button></div></section>
    </main>
    <footer className="border-t border-border py-8"><div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-sm text-muted-foreground sm:flex-row"><Link to="/v2"><img src={logoOlaAura} alt="Olá Aura" className="h-10 w-auto" /></Link><p>Movimento Olá Aura · participação livre, respeitosa e sem pressão.</p></div></footer>
  </div>;
}
