import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Award, Check, CheckCircle2, Copy, HeartHandshake, History, MessageCircle, Quote, Share2, Sparkles, Sprout, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { claimMovementReferral, decideMovementRecognition, MOVEMENT_ACHIEVEMENTS, PARTICIPANT_ACHIEVEMENTS } from "@/lib/movement";
import { toast } from "@/hooks/use-toast";
import movementGroupImage from "@/assets/movimento-grupo-abraco-logo-real.jpg";
import movementImage from "@/assets/movimento-ola-aura.jpg";
import { MovementAchievementSymbol, MovementBelonging, MovementCollectiveProgress, MovementCommunityMural, MovementGiftPreview, MovementInviteJourney, MovementMemberOpening } from "./MovementCommunityVisuals";
import { trackMovement, useMovementVisibility } from "@/lib/movement-analytics";
import { MOVEMENT_INVITE_MESSAGES, movementInviteUrl } from "@/lib/movement-invite";

const messages = MOVEMENT_INVITE_MESSAGES;

type Member = { id: string; public_name: string; display_mode: string; referral_code: string; show_achievements: boolean; receive_updates: boolean; created_at: string; ambassador_since: string | null };
type Recognition = { id: string; kind: string; title: string; body: string; status: string; consent_decision: string; created_at: string };
type MovementSnapshot = { members: number; started: number; continued: number; mural: Array<{ id: string; title: string; body: string; member_name: string }> };
type Props = { userId: string; suggestedName?: string; embedded?: boolean; initialAmbassadorIntent?: boolean; onJoined?: () => void; previewIntroduction?: boolean; isActive?: boolean };

const causeMessages = [
  "Ninguém deveria precisar enfrentar tudo sozinho.",
  "Compreender a si mesmo não deveria ser privilégio de poucos.",
  "Uma conversa com direção pode mudar o começo de uma história.",
] as const;

export function MovementDashboard({ userId, suggestedName = "", embedded = false, initialAmbassadorIntent = false, onJoined, previewIntroduction = false, isActive = true }: Props) {
  const surface = embedded ? "app" : "area";
  const [member, setMember] = useState<Member | null>(null);
  const [referrals, setReferrals] = useState<Array<{ reached_at: string; started_at: string | null; continued_at: string | null; is_valid: boolean }>>([]);
  const [recognitions, setRecognitions] = useState<Recognition[]>([]);
  const [snapshot, setSnapshot] = useState<MovementSnapshot | null>(null);
  const [causeMessage, setCauseMessage] = useState("");
  const [name, setName] = useState(suggestedName);
  const [displayMode, setDisplayMode] = useState("first_name");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(!previewIntroduction);
  const trackingRef = useMovementVisibility(surface, isActive && !previewIntroduction && !loading, "area_opened");
  const [saving, setSaving] = useState(false);
  const [activatingAmbassador, setActivatingAmbassador] = useState(false);
  // Mensagem única de convite: quem está no App já usa a Aura.
  const messageKind = "user" as const;
  const shareMessage = messages.user;
  const [selectedRole, setSelectedRole] = useState<"participant" | "ambassador" | null>(initialAmbassadorIntent ? "ambassador" : null);

  const load = async () => {
    const [{ data }, { data: snapshotData }, { data: causeEvents }] = await Promise.all([
      supabasePortal.from("movement_members").select("*").eq("user_id", userId).maybeSingle(),
      supabasePortal.functions.invoke("movement-public", { body: { action: "snapshot" } }),
      supabasePortal.from("portal_value_events").select("metadata").eq("user_id", userId).eq("feature", "movement").eq("event_type", "cause_selected").order("created_at", { ascending: false }).limit(1),
    ]);
    setSnapshot((snapshotData?.result as MovementSnapshot | undefined) || null);
    const savedCause = causeEvents?.[0]?.metadata;
    if (savedCause && typeof savedCause === "object" && "cause" in savedCause && typeof savedCause.cause === "string") setCauseMessage(savedCause.cause);
    if (data) {
      setMember(data);
      const [{ data: rows }, { data: recognitionRows }] = await Promise.all([
        supabasePortal.from("movement_referrals").select("reached_at,started_at,continued_at,is_valid").eq("member_id", data.id).order("reached_at", { ascending: false }),
        supabasePortal.from("movement_recognitions").select("id,kind,title,body,status,consent_decision,created_at").eq("member_id", data.id).order("created_at", { ascending: false }),
      ]);
      setReferrals(rows || []);
      setRecognitions(recognitionRows || []);
    }
    setLoading(false);
  };

  useEffect(() => { if (!previewIntroduction) void claimMovementReferral().finally(load); }, [userId, previewIntroduction]);

  const counts = useMemo(() => ({
    reached: referrals.filter((r) => r.is_valid).length,
    started: referrals.filter((r) => r.is_valid && r.started_at).length,
    continued: referrals.filter((r) => r.is_valid && r.continued_at).length,
  }), [referrals]);

  const unlocked = (achievement: typeof MOVEMENT_ACHIEVEMENTS[number]) => {
    if (achievement.metric === "started") return counts.started >= achievement.threshold;
    if (achievement.metric === "continued") return counts.continued >= achievement.threshold;
    if (achievement.metric === "voice") return recognitions.some((recognition) => recognition.kind === "voice" && recognition.consent_decision === "accepted");
    return false;
  };

  const nextAchievement = MOVEMENT_ACHIEVEMENTS.find((achievement) => !unlocked(achievement) && achievement.metric !== "voice");
  const nextCurrent = nextAchievement?.metric === "continued" ? counts.continued : nextAchievement?.metric === "started" ? counts.started : 0;
  const nextProgress = nextAchievement ? Math.min(100, Math.round((nextCurrent / nextAchievement.threshold) * 100)) : 100;
  const createMember = async () => {
    if (previewIntroduction || !name.trim() || !accepted) return;
    recordEvent("join_started");
    setSaving(true);
    const joiningAsAmbassador = true;
    const ambassadorSince = joiningAsAmbassador ? new Date().toISOString() : null;
    const { data, error } = await supabasePortal.from("movement_members").insert({ user_id: userId, public_name: name.trim(), display_mode: displayMode, receive_updates: false, ambassador_since: ambassadorSince }).select("*").single();
    setSaving(false);
    if (error) { recordEvent("join_failed"); return toast({ title: "Não conseguimos concluir agora", description: "Tente novamente em instantes.", variant: "destructive" }); }
    setMember(data);
    recordEvent("member_joined", { mode: "form" });
    onJoined?.();
    if (joiningAsAmbassador) {
      toast({ title: "Agora você faz parte 💚", description: "Seu convite pessoal está pronto para quem você ama." });
      return;
    }
    toast({ title: "Agora você faz parte", description: "Sua conquista “Eu Faço Parte” já está liberada." });
  };

  // Entrada em 1 toque no App: usa o nome do cadastro e registra a escolha explícita do papel.
  const quickJoin = async (role: "participant" | "ambassador") => {
    if (previewIntroduction || saving) return;
    const publicName = (suggestedName.trim().split(/\s+/)[0] || "").trim();
    if (!publicName) { setSelectedRole("participant"); return; }
    recordEvent("role_selected", { role, mode: "quick" });
    recordEvent("join_started", { mode: "quick" });
    setSaving(true);
    const ambassadorSince = role === "ambassador" ? new Date().toISOString() : null;
    const { data, error } = await supabasePortal.from("movement_members").insert({ user_id: userId, public_name: suggestedName.trim(), display_mode: "first_name", receive_updates: false, ambassador_since: ambassadorSince }).select("*").single();
    setSaving(false);
    if (error) { recordEvent("join_failed"); return toast({ title: "Não conseguimos concluir agora", description: "Tente novamente em instantes.", variant: "destructive" }); }
    setMember(data);
    recordEvent("member_joined", { mode: "quick" });
    onJoined?.();
    if (role === "ambassador") {
      toast({ title: `${publicName}, você faz parte 💚`, description: "Seu convite pessoal está pronto. É só enviar para quem veio à sua mente." });
      window.setTimeout(() => document.getElementById("movement-ambassador-kit")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
      return;
    }
    toast({ title: `${publicName}, você faz parte 💚`, description: "Sua conquista “Eu Faço Parte” já está liberada." });
  };


  const recordEvent = (eventType: string, metadata: Record<string, string> = {}) => {
    if (previewIntroduction || !isActive) return;
    trackMovement(eventType, surface, eventType === "cause_selected" ? {} : metadata);
    if (eventType === "cause_selected") void supabasePortal.from("portal_value_events").insert({ user_id: userId, feature: "movement", event_type: eventType, source: "app", metadata });
  };

  const selectCauseMessage = (message: string) => {
    setCauseMessage(message);
    recordEvent("cause_selected", { cause: message });
    toast({ title: "Essa mensagem agora representa seu apoio", description: "Você pode mudar sua escolha quando quiser." });
  };

  const chooseRole = (role: "participant" | "ambassador") => {
    setSelectedRole(role);
    recordEvent("role_selected", { role });
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const decideRecognition = async (recognition: Recognition, decision: "accepted" | "declined") => {
    const result = await decideMovementRecognition(recognition.id, decision);
    if (!result.ok) return toast({ title: "Não conseguimos salvar sua decisão", description: "Tente novamente em instantes.", variant: "destructive" });
    toast({ title: decision === "accepted" ? "Reconhecimento autorizado" : "Publicação recusada", description: decision === "accepted" ? "Ele agora pode aparecer no Mural do Movimento." : "Ele continuará visível somente para você." });
    void load();
  };

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Abrindo o Movimento…</div>;

  if (!member && embedded && !selectedRole) return (
    <div ref={trackingRef} data-movement-event="introduction_viewed" className="space-y-10 pb-6">
      <section className="relative overflow-hidden rounded-2xl shadow-xl">
        <img src={movementGroupImage} alt="Pessoas se abraçando com camisetas da Olá Aura" className="h-[300px] w-full object-cover sm:h-[360px]" />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground via-foreground/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 text-primary-foreground sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wide"><HeartHandshake className="h-3.5 w-3.5" /> Movimento Olá Aura</span>
          <h2 className="mt-3 max-w-xl font-display text-2xl font-semibold leading-tight sm:text-3xl">Ninguém deveria enfrentar tudo sozinho.</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-primary-foreground/85">Aqui você presenteia quem você ama com um primeiro encontro gratuito de 45 minutos com a Aura.</p>
        </div>
      </section>

      <section id="app-escolha-movimento" className="scroll-mt-4">
        <p className="text-xs font-bold uppercase text-primary">Um toque e você faz parte</p>
        <h3 className="mt-2 font-display text-2xl font-semibold">Sabe aquela amiga, mãe ou irmã que está passando por um momento difícil?</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Ao fazer parte, você já pode enviar a ela um primeiro encontro gratuito com a Aura. Sem formulário: entramos com o seu nome, {suggestedName.trim().split(/\s+/)[0] || "e você ajusta depois"}.</p>
        <Button type="button" size="lg" className="mt-5 h-auto min-h-14 w-full justify-between whitespace-normal py-3 text-left" disabled={saving} onClick={() => quickJoin("ambassador")}><span className="flex items-center gap-2"><HeartHandshake className="shrink-0" /> {saving ? "Entrando…" : "Fazer parte do Movimento"}</span><ArrowRight className="shrink-0" /></Button>
        <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">Participar é gratuito. Aqui você aparece só pelo primeiro nome.</p>
      </section>
    </div>
  );

  if (!member) return (
    <div ref={trackingRef} data-movement-event="form_viewed" className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[.85fr_1.15fr] lg:gap-20 lg:py-20">
      <section className="lg:pt-3">
        <p className="text-xs font-bold uppercase text-primary">{false ? "Seu primeiro gesto" : "Seu primeiro passo"}</p>
        <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">{false ? "Entre para o Movimento como Embaixador." : "Faça parte de algo que pode chegar muito além de você."}</h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">{false ? "Além de fazer parte, você poderá apresentar a Olá Aura a outras pessoas com seu link pessoal e acompanhar o impacto sem expor ninguém." : "Você não precisa ser cliente, ter seguidores ou vender nada. Basta acreditar que mais pessoas merecem acesso a compreensão e direção."}</p>
        <div className="mt-7 hidden space-y-5 border-t border-border pt-7 lg:block">
          {(false ? ["Faça parte gratuitamente", "Receba seu link pessoal", "Compartilhe sem meta ou obrigação"] : ["Faça parte gratuitamente", "Escolha como seu nome aparece", "Decida depois se quer ser Embaixador"]).map((item) => <div key={item} className="flex items-center gap-3 text-sm font-semibold"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /><span>{item}</span></div>)}
        </div>
      </section>
      <section className="border-t border-border pt-7 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-1">
         <div className="flex items-start justify-between gap-4"><div><p className="font-display text-xl font-semibold">{false ? "Confirme sua entrada como Embaixador" : "Confirme sua participação"}</p><p className="mt-1 text-sm text-muted-foreground">{false ? "Ser Embaixador também confirma seu lugar como Participante do Movimento." : "Você controla como seu nome aparece e pode mudar isso depois."}</p></div>{embedded && <Button type="button" variant="ghost" size="sm" onClick={() => { recordEvent("form_back"); setSelectedRole(null); setAccepted(false); }}>Voltar</Button>}</div>
        <div className="mt-6 space-y-5">
          <label className="block"><span className="mb-2 block text-sm font-semibold">Como devemos chamar você?</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" /></label>
          <label className="block"><span className="mb-2 block text-sm font-semibold">Como aparecer no Mural?</span><select value={displayMode} onChange={(e) => setDisplayMode(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="first_name">Primeiro nome</option><option value="full_name">Nome completo</option><option value="initials">Iniciais</option><option value="private">Participação privada</option></select></label>
           <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4"><Checkbox checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} className="mt-0.5" /><span className="text-sm leading-relaxed">{false ? "Quero fazer parte e ser Embaixador do Movimento Olá Aura. Sei que não há meta, comissão ou obrigação de divulgar." : "Quero fazer parte do Movimento Olá Aura. Sei que participar não me obriga a divulgar."}</span></label>
        </div>
         <Button className="mt-6 w-full sm:w-auto" size="lg" disabled={previewIntroduction || !accepted || !name.trim() || saving} onClick={createMember}><HeartHandshake /> {saving ? "Entrando…" : false ? "Fazer parte como Embaixador" : "Quero fazer parte"}</Button>
      </section>
    </div>
  );

  const becomeAmbassador = async () => {
    setActivatingAmbassador(true);
    const ambassadorSince = new Date().toISOString();
    const { error } = await supabasePortal.from("movement_members").update({ ambassador_since: ambassadorSince }).eq("id", member.id);
    setActivatingAmbassador(false);
    if (error) return toast({ title: "Não conseguimos concluir agora", description: "Tente novamente em instantes.", variant: "destructive" });
    setMember({ ...member, ambassador_since: ambassadorSince });
    toast({ title: "Agora você faz parte 💚", description: "Seu convite pessoal está pronto para quem você ama." });
  };

  if (false && !member.ambassador_since) return (
    <div ref={trackingRef} className={embedded ? "space-y-8" : "mx-auto max-w-4xl space-y-10 px-5 py-10"}>
      <section className="rounded-2xl bg-primary px-5 py-6 text-primary-foreground shadow-xl sm:px-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground px-3 py-1 text-[11px] font-bold uppercase text-primary"><HeartHandshake className="h-3.5 w-3.5" /> {member.public_name}, você faz parte</span>
        <h2 className="mt-4 font-display text-3xl font-semibold leading-tight">Lembrou de alguém que está passando por um momento difícil?</h2>
        <p className="mt-2 text-sm leading-relaxed text-primary-foreground/90">Você pode presentear essa pessoa com um primeiro encontro gratuito de 45 minutos com a Aura.</p>
        <Button size="lg" variant="secondary" className="mt-5 w-full sm:w-auto" onClick={becomeAmbassador} disabled={activatingAmbassador}><MessageCircle /> {activatingAmbassador ? "Preparando…" : "Quero presentear alguém"}</Button>
      </section>
      <MovementCollectiveProgress snapshot={snapshot} />
      <div data-movement-event="mural_viewed"><MovementCommunityMural stories={snapshot?.mural || []} /></div>
      <section><div className="flex items-center gap-3"><Award className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Suas conquistas</h3></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{PARTICIPANT_ACHIEVEMENTS.map((achievement, index) => { const isUnlocked = achievement.id === "member" || (achievement.id === "cause" && Boolean(causeMessage)) || (achievement.id === "connected" && member.receive_updates); return <div key={achievement.id} className={`flex flex-col items-start gap-3 rounded-lg border bg-card p-4 ${isUnlocked ? "border-primary/35" : "border-border"}`}><MovementAchievementSymbol id={achievement.id} index={index} /><div><p className="font-semibold">{achievement.name}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{achievement.description}</p><p className="mt-2 text-xs font-semibold text-primary">{isUnlocked ? "Conquistado" : "Ainda por construir"}</p></div></div>; })}</div></section>
      <section>
        <div className="flex items-center gap-3"><Quote className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">O que representa seu apoio?</h3></div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Escolha a mensagem da causa que mais conversa com você. Ela fica na sua área e pode ser alterada depois.</p>
        <div className="mt-5 grid gap-3">{causeMessages.map((message) => <Button key={message} type="button" variant={causeMessage === message ? "secondary" : "outline"} className="h-auto min-h-14 justify-start whitespace-normal px-4 py-3 text-left leading-relaxed" onClick={() => selectCauseMessage(message)}>{causeMessage === message && <Check className="shrink-0" />}<span>{message}</span></Button>)}</div>
      </section>
    </div>
  );

  const shareUrl = movementInviteUrl(member.referral_code);
  const shareText = `${shareMessage.trim()}\n${shareUrl}`;
  const copy = async () => { await navigator.clipboard.writeText(shareText); recordEvent("invite_copied", { message_kind: messageKind }); toast({ title: "Convite copiado", description: "Agora é só enviar para quem veio à sua mente." }); };
  const pendingRecognitions = recognitions.filter((recognition) => recognition.consent_decision === "pending");
  const decidedRecognitions = recognitions.filter((recognition) => recognition.consent_decision !== "pending");
  const recentImpact = referrals.filter((referral) => referral.is_valid).slice(0, 4);

  return (
    <div ref={trackingRef} className={embedded ? "space-y-8" : "mx-auto max-w-5xl space-y-10 px-5 py-10"}>
      <section id="movement-ambassador-kit" data-movement-event="kit_viewed" aria-label="Presentear alguém" className="scroll-mt-5 overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-xl">
        <div className="relative">
          <img src={movementGroupImage} alt="Pessoas se abraçando com camisetas da Olá Aura" className="h-[220px] w-full object-cover sm:h-[300px]" />
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/30 to-transparent" />
        </div>
        <div className="-mt-10 relative px-5 sm:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground px-3 py-1 text-[11px] font-bold uppercase text-primary"><HeartHandshake className="h-3.5 w-3.5" /> Seu presente</span>
          <h2 className="mt-4 font-display text-3xl font-semibold leading-tight">{member.public_name}, quem veio ao seu coração agora?</h2>
          <p className="mt-2 text-sm leading-relaxed text-primary-foreground/90">Você pode presentear uma pessoa querida com um primeiro encontro gratuito de 45 minutos com a Aura.</p>
          <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
            <Button size="lg" variant="secondary" asChild><a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" onClick={() => recordEvent("whatsapp_share_started", { message_kind: messageKind })}><MessageCircle /> Presentear no WhatsApp</a></Button>
            <Button size="lg" variant="ghost" className="border border-primary-foreground/60 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" onClick={copy}><Copy /> Copiar convite</Button>
          </div>
        </div>
        {counts.reached > 0 ? <>
          <div className="mt-6 grid grid-cols-3 gap-2 px-4 sm:gap-3 sm:px-8">
            {[{ v: counts.reached, l: "Abriram seu convite", icon: Share2 }, { v: counts.started, l: "Começaram a conversar", icon: MessageCircle }, { v: counts.continued, l: "Seguiram cuidando de si", icon: Sprout }].map(({ v, l, icon: Icon }) => <div key={l} className="rounded-xl bg-card p-3 text-center text-card-foreground shadow-md sm:p-4"><Icon className="mx-auto h-5 w-5 text-primary" /><p className="mt-2 font-display text-3xl font-semibold text-primary sm:text-4xl">{v}</p><p className="mt-1 text-[11px] font-semibold leading-tight text-muted-foreground sm:text-xs">{l}</p></div>)}
          </div>
          <p className="px-5 pb-6 pt-4 text-[11px] text-primary-foreground/75 sm:px-8 sm:pb-8">{`${counts.reached} ${counts.reached === 1 ? "pessoa recebeu" : "pessoas receberam"} esse cuidado por você.`} Ninguém é identificado.</p>
        </> : <p className="px-5 pb-6 pt-5 text-sm leading-relaxed text-primary-foreground/85 sm:px-8 sm:pb-8">Uma mensagem carinhosa, enviada na hora certa, pode mudar o dia de alguém.</p>}
      </section
      ><MovementGiftPreview />
      <MovementCollectiveProgress snapshot={snapshot} />
      <div data-movement-event="mural_viewed"><MovementCommunityMural stories={snapshot?.mural || []} /></div>
      <MovementInviteJourney />
      <MovementBelonging name={member.public_name} since={member.created_at} />
      <section className="overflow-hidden rounded-2xl bg-primary px-6 py-10 text-center text-primary-foreground sm:px-10">
        <HeartHandshake className="mx-auto h-8 w-8" aria-hidden="true" />
        <p className="mx-auto mt-4 max-w-xl font-display text-2xl font-semibold leading-tight sm:text-3xl">Talvez alguém esteja esperando, sem saber, por uma mensagem sua hoje.</p>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-primary-foreground/85">Pense em uma pessoa. Não precisa ser alguém em crise, basta ser alguém que você quer bem.</p>
        <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Button size="lg" variant="secondary" asChild><a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" onClick={() => recordEvent("whatsapp_share_started", { message_kind: messageKind, place: "closing" })}><MessageCircle /> Presentear no WhatsApp</a></Button>
          <Button size="lg" variant="ghost" className="border border-primary-foreground/60 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" onClick={copy}><Copy /> Copiar convite</Button>
        </div>
      </section>
      {pendingRecognitions.length > 0 && <section className="space-y-3"><div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Você foi reconhecido</h3></div>{pendingRecognitions.map((recognition) => <article key={recognition.id} className="rounded-lg border border-primary/30 bg-secondary/50 p-5"><p className="text-xs font-bold uppercase text-primary">Voz do Movimento</p><h4 className="mt-2 font-display text-xl font-semibold">{recognition.title}</h4><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{recognition.body}</p><p className="mt-4 text-xs text-muted-foreground">Você decide se este reconhecimento pode aparecer no Mural público.</p><div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => decideRecognition(recognition, "accepted")}><CheckCircle2 /> Autorizar publicação</Button><Button variant="outline" onClick={() => decideRecognition(recognition, "declined")}>Manter privado</Button></div></article>)}</section>}
      {decidedRecognitions.length > 0 && <section><div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Seus reconhecimentos</h3></div><div className="mt-4 space-y-3">{decidedRecognitions.map((recognition) => <article key={recognition.id} className="border-l-2 border-primary bg-secondary/30 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase text-primary">{recognition.kind === "voice" ? "Voz do Movimento" : "Reconhecimento"}</p><p className="text-xs text-muted-foreground">{recognition.consent_decision === "accepted" ? "Autorizado para o Mural" : "Visível somente para você"}</p></div><h4 className="mt-2 font-display text-xl font-semibold">{recognition.title}</h4><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{recognition.body}</p></article>)}</div></section>}
      {recentImpact.length > 0 && <section><div className="flex items-center gap-3"><History className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Seu cuidado no mundo</h3></div><div className="mt-4 divide-y divide-border border-y border-border">{recentImpact.map((item, index) => <div key={`${item.reached_at}-${index}`} className="flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-semibold">{item.continued_at ? "Uma pessoa decidiu continuar" : item.started_at ? "Uma pessoa começou uma conversa" : "Seu convite foi conhecido"}</p><p className="mt-1 text-xs text-muted-foreground">Sem expor a identidade de quem recebeu.</p></div><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /></div>)}</div></section>}
      {MOVEMENT_ACHIEVEMENTS.some(unlocked) && <section>
        <div className="flex items-center gap-3"><Award className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Marcos do seu cuidado</h3></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{MOVEMENT_ACHIEVEMENTS.filter(unlocked).map((achievement, index) => <div key={achievement.id} className="flex items-start gap-3 rounded-lg border border-primary/35 bg-card p-4"><MovementAchievementSymbol id={achievement.id} index={index} /><div><p className="font-semibold">{achievement.name}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{achievement.description}</p></div></div>)}</div>
      </section>}
    </div>
  );
}
