import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Award, Check, CheckCircle2, Copy, HeartHandshake, History, MessageCircle, Quote, Share2, Sparkles, Sprout, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { claimMovementReferral, decideMovementRecognition, MOVEMENT_ACHIEVEMENTS, PARTICIPANT_ACHIEVEMENTS } from "@/lib/movement";
import { toast } from "@/hooks/use-toast";
import movementGroupImage from "@/assets/movimento-grupo-abraco-logo-real.jpg";
import movementImage from "@/assets/movimento-ola-aura.jpg";
import { MovementAchievementSymbol, MovementCollectiveProgress, MovementCommunityMural, MovementMemberOpening } from "./MovementCommunityVisuals";
import { MOVEMENT_INVITE_MESSAGES } from "@/lib/movement-invite";

const messages = MOVEMENT_INVITE_MESSAGES;

type Member = { id: string; public_name: string; display_mode: string; referral_code: string; show_achievements: boolean; receive_updates: boolean; created_at: string; ambassador_since: string | null };
type Recognition = { id: string; kind: string; title: string; body: string; status: string; consent_decision: string; created_at: string };
type MovementSnapshot = { members: number; started: number; continued: number; mural: Array<{ id: string; title: string; body: string; member_name: string }> };
type Props = { userId: string; suggestedName?: string; embedded?: boolean; initialAmbassadorIntent?: boolean; onJoined?: () => void; previewIntroduction?: boolean };

const causeMessages = [
  "Ninguém deveria precisar enfrentar tudo sozinho.",
  "Compreender a si mesmo não deveria ser privilégio de poucos.",
  "Uma conversa com direção pode mudar o começo de uma história.",
] as const;

export function MovementDashboard({ userId, suggestedName = "", embedded = false, initialAmbassadorIntent = false, onJoined, previewIntroduction = false }: Props) {
  const [member, setMember] = useState<Member | null>(null);
  const [referrals, setReferrals] = useState<Array<{ reached_at: string; started_at: string | null; continued_at: string | null; is_valid: boolean }>>([]);
  const [recognitions, setRecognitions] = useState<Recognition[]>([]);
  const [snapshot, setSnapshot] = useState<MovementSnapshot | null>(null);
  const [causeMessage, setCauseMessage] = useState("");
  const [name, setName] = useState(suggestedName);
  const [displayMode, setDisplayMode] = useState("first_name");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(!previewIntroduction);
  const [saving, setSaving] = useState(false);
  const [activatingAmbassador, setActivatingAmbassador] = useState(false);
  const [messageKind, setMessageKind] = useState<keyof typeof messages>("supporter");
  const [shareMessage, setShareMessage] = useState(messages.supporter);
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
    setSaving(true);
    const joiningAsAmbassador = initialAmbassadorIntent || selectedRole === "ambassador";
    const ambassadorSince = joiningAsAmbassador ? new Date().toISOString() : null;
    const { data, error } = await supabasePortal.from("movement_members").insert({ user_id: userId, public_name: name.trim(), display_mode: displayMode, receive_updates: false, ambassador_since: ambassadorSince }).select("*").single();
    setSaving(false);
    if (error) return toast({ title: "Não conseguimos concluir agora", description: "Tente novamente em instantes.", variant: "destructive" });
    setMember(data);
    onJoined?.();
    if (joiningAsAmbassador) {
      recordEvent("ambassador_joined");
      toast({ title: "Agora você é Embaixador", description: "Seu link pessoal e as ferramentas de impacto estão liberados." });
      return;
    }
    toast({ title: "Agora você faz parte", description: "Sua conquista “Eu Faço Parte” já está liberada." });
  };

  const updatePreference = async (field: "show_achievements" | "receive_updates", value: boolean) => {
    if (!member) return;
    setMember({ ...member, [field]: value });
    const preference = field === "show_achievements" ? { show_achievements: value } : { receive_updates: value };
    await supabasePortal.from("movement_members").update(preference).eq("id", member.id);
  };

  const recordEvent = (eventType: string, metadata: Record<string, string> = {}) => {
    if (previewIntroduction) return;
    void supabasePortal.from("portal_value_events").insert({ user_id: userId, feature: "movement", event_type: eventType, source: "app", metadata });
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
    <div className="space-y-10 pb-6">
      {/* Abertura com a foto do Movimento, como no site */}
      <section className="relative overflow-hidden rounded-2xl shadow-xl">
        <img src={movementGroupImage} alt="Pessoas se abraçando com camisetas da Olá Aura" className="h-[440px] w-full object-cover sm:h-[480px]" />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground via-foreground/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 text-primary-foreground sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wide"><Sparkles className="h-3.5 w-3.5" /> Movimento Olá Aura</span>
          <h2 className="mt-4 max-w-xl font-display text-3xl font-semibold leading-tight sm:text-4xl">Compreender a si mesmo não deveria ser privilégio de poucos.</h2>
          <p className="mt-3 max-w-xl leading-relaxed text-primary-foreground/85">Pessoas que acreditam que apoio, compreensão e direção precisam chegar a mais gente — com respeito e sem pressão.</p>
          <Button type="button" size="lg" className="mt-5 w-full sm:w-auto" onClick={() => document.getElementById("app-escolha-movimento")?.scrollIntoView({ behavior: "smooth" })}>Quero fazer parte <ArrowRight /></Button>
        </div>
      </section>

      {snapshot && snapshot.members >= 10 && (
        <section className="grid grid-cols-3 gap-3 text-center">
          {[{ v: snapshot.members, l: "pessoas no Movimento" }, { v: snapshot.started, l: "primeiras conversas" }, { v: snapshot.continued, l: "seguiram conversando" }].map(({ v, l }) => <div key={l} className="rounded-xl bg-secondary p-4"><p className="font-display text-3xl font-semibold text-primary">{v}</p><p className="mt-1 text-xs leading-snug text-muted-foreground">{l}</p></div>)}
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        {[{ icon: HeartHandshake, title: "Pertencer", text: "Faça parte gratuitamente e acompanhe o impacto coletivo." }, { icon: Quote, title: "Reconhecer", text: "Conheça histórias reais, publicadas somente com autorização." }, { icon: Share2, title: "Multiplicar", text: "Se quiser, compartilhe a Olá Aura com seu link pessoal." }].map(({ icon: Icon, title, text }) => <div key={title} className="rounded-xl border border-border bg-card p-5 shadow-sm"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground"><Icon className="h-5 w-5" /></span><h3 className="mt-4 font-display text-xl font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></div>)}
      </section>

      <section className="relative overflow-hidden rounded-2xl">
        <img src={movementImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-primary/85" />
        <div className="relative p-6 text-primary-foreground sm:p-8">
          <Quote className="h-7 w-7 opacity-80" />
          <p className="mt-3 font-display text-2xl font-semibold leading-snug">Ninguém deveria precisar enfrentar tudo sozinho.</p>
          <p className="mt-2 text-sm text-primary-foreground/85">Uma conversa com direção pode mudar o começo de uma história.</p>
        </div>
      </section>

      <section id="app-escolha-movimento" className="scroll-mt-4">
        <p className="text-xs font-bold uppercase text-primary">Escolha como participar</p>
        <h3 className="mt-2 font-display text-2xl font-semibold">Você decide o seu lugar no Movimento.</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Os dois caminhos fazem parte da mesma causa. Você pode mudar de ideia depois.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="relative rounded-xl bg-primary p-5 text-primary-foreground shadow-lg">
            <span className="absolute right-4 top-4 rounded-full bg-primary-foreground px-2.5 py-0.5 text-[11px] font-bold uppercase text-primary">Destaque</span>
            <MessageCircle className="h-7 w-7" />
            <p className="mt-4 text-xs font-bold uppercase opacity-80">Embaixador</p>
            <h4 className="mt-1 font-display text-xl font-semibold">Eu quero multiplicar</h4>
            <p className="mt-2 text-sm leading-relaxed text-primary-foreground/85">Tudo de Participante, mais um link pessoal, materiais para compartilhar e acompanhamento do impacto.</p>
            <Button type="button" variant="secondary" className="mt-5 w-full" onClick={() => chooseRole("ambassador")}>Escolher Embaixador <ArrowRight /></Button>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <HeartHandshake className="h-7 w-7 text-primary" />
            <p className="mt-4 text-xs font-bold uppercase text-primary">Participante</p>
            <h4 className="mt-1 font-display text-xl font-semibold">Eu faço parte</h4>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Acompanhe o Movimento, o Mural e suas conquistas de pertencimento. Não precisa divulgar.</p>
            <Button type="button" variant="outline" className="mt-5 w-full" onClick={() => chooseRole("participant")}>Escolher Participante <ArrowRight /></Button>
          </div>
        </div>
        <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">Participar é gratuito. Não há comissão, meta ou obrigação de compartilhar.</p>
      </section>
    </div>
  );

  if (!member) return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[.85fr_1.15fr] lg:gap-20 lg:py-20">
      <section className="lg:pt-3">
        <p className="text-xs font-bold uppercase text-primary">{initialAmbassadorIntent || selectedRole === "ambassador" ? "Seu primeiro gesto" : "Seu primeiro passo"}</p>
        <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">{initialAmbassadorIntent || selectedRole === "ambassador" ? "Entre para o Movimento como Embaixador." : "Faça parte de algo que pode chegar muito além de você."}</h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">{initialAmbassadorIntent || selectedRole === "ambassador" ? "Além de fazer parte, você poderá apresentar a Olá Aura a outras pessoas com seu link pessoal e acompanhar o impacto sem expor ninguém." : "Você não precisa ser cliente, ter seguidores ou vender nada. Basta acreditar que mais pessoas merecem acesso a compreensão e direção."}</p>
        <div className="mt-7 hidden space-y-5 border-t border-border pt-7 lg:block">
          {(initialAmbassadorIntent || selectedRole === "ambassador" ? ["Faça parte gratuitamente", "Receba seu link pessoal", "Compartilhe sem meta ou obrigação"] : ["Faça parte gratuitamente", "Escolha como seu nome aparece", "Decida depois se quer ser Embaixador"]).map((item) => <div key={item} className="flex items-center gap-3 text-sm font-semibold"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /><span>{item}</span></div>)}
        </div>
      </section>
      <section className="border-t border-border pt-7 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-1">
         <div className="flex items-start justify-between gap-4"><div><p className="font-display text-xl font-semibold">{initialAmbassadorIntent || selectedRole === "ambassador" ? "Confirme sua entrada como Embaixador" : "Confirme sua participação"}</p><p className="mt-1 text-sm text-muted-foreground">{initialAmbassadorIntent || selectedRole === "ambassador" ? "Ser Embaixador também confirma seu lugar como Participante do Movimento." : "Você controla como seu nome aparece e pode mudar isso depois."}</p></div>{embedded && <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedRole(null); setAccepted(false); }}>Voltar</Button>}</div>
        <div className="mt-6 space-y-5">
          <label className="block"><span className="mb-2 block text-sm font-semibold">Como devemos chamar você?</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" /></label>
          <label className="block"><span className="mb-2 block text-sm font-semibold">Como aparecer no Mural?</span><select value={displayMode} onChange={(e) => setDisplayMode(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="first_name">Primeiro nome</option><option value="full_name">Nome completo</option><option value="initials">Iniciais</option><option value="private">Participação privada</option></select></label>
           <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4"><Checkbox checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} className="mt-0.5" /><span className="text-sm leading-relaxed">{initialAmbassadorIntent || selectedRole === "ambassador" ? "Quero fazer parte e ser Embaixador do Movimento Olá Aura. Sei que não há meta, comissão ou obrigação de divulgar." : "Quero fazer parte do Movimento Olá Aura. Sei que participar não me obriga a divulgar."}</span></label>
        </div>
         <Button className="mt-6 w-full sm:w-auto" size="lg" disabled={previewIntroduction || !accepted || !name.trim() || saving} onClick={createMember}><HeartHandshake /> {saving ? "Entrando…" : initialAmbassadorIntent || selectedRole === "ambassador" ? "Fazer parte como Embaixador" : "Quero fazer parte"}</Button>
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
    recordEvent("ambassador_joined");
    toast({ title: "Agora você é Embaixador", description: "Seu link pessoal e as ferramentas de impacto estão liberados." });
  };

  if (!member.ambassador_since) return (
    <div className={embedded ? "space-y-8" : "mx-auto max-w-4xl space-y-10 px-5 py-10"}>
      <MovementMemberOpening ambassador={false} />
      <MovementCollectiveProgress snapshot={snapshot} />
      <MovementCommunityMural stories={snapshot?.mural || []} />
      <section className="border-l-4 border-primary bg-[hsl(var(--portal-journey))] px-5 py-6 text-[hsl(var(--portal-journey-foreground))] sm:px-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground px-3 py-1 text-[11px] font-bold uppercase text-primary"><Sparkles className="h-3.5 w-3.5" /> Seu lugar nessa história · Participante</span>
        <h2 className="mt-4 font-display text-3xl font-semibold leading-tight">{member.public_name}, você faz parte.</h2>
        <p className="mt-2 text-sm">Seu apoio faz parte dessa construção coletiva. Você não precisa indicar ninguém para pertencer.</p>
      </section>
      <section><div className="flex items-center gap-3"><Award className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Suas conquistas</h3></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{PARTICIPANT_ACHIEVEMENTS.map((achievement, index) => { const isUnlocked = achievement.id === "member" || (achievement.id === "cause" && Boolean(causeMessage)) || (achievement.id === "connected" && member.receive_updates); return <div key={achievement.id} className={`flex flex-col items-start gap-3 rounded-lg border bg-card p-4 ${isUnlocked ? "border-primary/35" : "border-border"}`}><MovementAchievementSymbol id={achievement.id} index={index} /><div><p className="font-semibold">{achievement.name}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{achievement.description}</p><p className="mt-2 text-xs font-semibold text-primary">{isUnlocked ? "Conquistado" : "Ainda por construir"}</p></div></div>; })}</div></section>
      <section>
        <div className="flex items-center gap-3"><Quote className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">O que representa seu apoio?</h3></div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Escolha a mensagem da causa que mais conversa com você. Ela fica na sua área e pode ser alterada depois.</p>
        <div className="mt-5 grid gap-3">{causeMessages.map((message) => <Button key={message} type="button" variant={causeMessage === message ? "secondary" : "outline"} className="h-auto min-h-14 justify-start whitespace-normal px-4 py-3 text-left leading-relaxed" onClick={() => selectCauseMessage(message)}>{causeMessage === message && <Check className="shrink-0" />}<span>{message}</span></Button>)}</div>
      </section>
      <section className="border-t border-border pt-7"><h3 className="font-display text-xl font-semibold">Sua privacidade</h3><div className="mt-4 space-y-4"><label className="flex items-center justify-between gap-4"><span><b className="block text-sm">Mostrar sua participação no Mural</b><span className="text-xs text-muted-foreground">Seu modo de exibição continua sendo respeitado.</span></span><Switch checked={member.show_achievements} onCheckedChange={(v) => updatePreference("show_achievements", v)} /></label><label className="flex items-center justify-between gap-4"><span><b className="block text-sm">Receber novidades do Movimento</b><span className="text-xs text-muted-foreground">Somente atualizações relevantes.</span></span><Switch checked={member.receive_updates} onCheckedChange={(v) => updatePreference("receive_updates", v)} /></label></div></section>
      <section className={`grid gap-6 border-y border-border py-7 md:grid-cols-[1fr_auto] md:items-center ${initialAmbassadorIntent ? "border-l-2 border-l-primary pl-5" : ""}`}>
        <div><p className="text-xs font-bold uppercase text-primary">{initialAmbassadorIntent ? "Você veio para este passo" : "Se um dia fizer sentido"}</p><h3 className="mt-2 font-display text-2xl font-semibold">Quer também ser Embaixador?</h3><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Embaixadores escolhem apresentar a Olá Aura a outras pessoas, recebem um link pessoal e acompanham o impacto sem ver a identidade de ninguém. Não há meta, comissão ou obrigação de compartilhar.</p></div>
        <Button size="lg" variant={initialAmbassadorIntent ? "default" : "outline"} onClick={becomeAmbassador} disabled={activatingAmbassador}><HeartHandshake /> {activatingAmbassador ? "Confirmando…" : "Quero ser Embaixador"}</Button>
      </section>
    </div>
  );

  const shareUrl = `${window.location.origin}/movimento?por=${member.referral_code}`;
  const shareText = `${shareMessage.trim()}\n${shareUrl}`;
  const selectMessage = (kind: keyof typeof messages) => { setMessageKind(kind); setShareMessage(messages[kind]); };
  const copy = async () => { await navigator.clipboard.writeText(shareText); recordEvent("invite_copied", { message_kind: messageKind }); toast({ title: "Convite copiado", description: "Agora é só enviar para quem veio à sua mente." }); };
  const share = async () => { recordEvent("share_started", { message_kind: messageKind }); if (navigator.share) await navigator.share({ title: "Movimento Olá Aura", text: shareMessage.trim(), url: shareUrl }); else await copy(); };
  const pendingRecognitions = recognitions.filter((recognition) => recognition.consent_decision === "pending");
  const decidedRecognitions = recognitions.filter((recognition) => recognition.consent_decision !== "pending");
  const recentImpact = referrals.filter((referral) => referral.is_valid).slice(0, 4);

  return (
    <div className={embedded ? "space-y-8" : "mx-auto max-w-5xl space-y-10 px-5 py-10"}>
      <MovementMemberOpening ambassador />
      <MovementCollectiveProgress snapshot={snapshot} />
      <MovementCommunityMural stories={snapshot?.mural || []} />
      <section aria-label="Seu impacto no Movimento" className="overflow-hidden border-l-4 border-primary bg-primary text-primary-foreground">
        <div className="px-5 pt-6 sm:px-8 sm:pt-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground px-3 py-1 text-[11px] font-bold uppercase text-primary"><Sparkles className="h-3.5 w-3.5" /> Seu lugar nessa história · Embaixador</span>
          <h2 className="mt-4 font-display text-3xl font-semibold leading-tight">{member.public_name}, este é o seu impacto.</h2>
          <p className="mt-2 text-sm text-primary-foreground/85">Seu gesto se soma ao de outras pessoas. Aqui está a sua contribuição para essa história coletiva.</p>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2 px-4 sm:gap-3 sm:px-8">
          {[{ v: counts.reached, l: "Alcançadas", icon: Share2 }, { v: counts.started, l: "Começaram", icon: MessageCircle }, { v: counts.continued, l: "Continuaram", icon: Sprout }].map(({ v, l, icon: Icon }) => <div key={l} className="rounded-xl bg-card p-3 text-center text-card-foreground shadow-md sm:p-4"><Icon className="mx-auto h-5 w-5 text-primary" /><p className="mt-2 font-display text-3xl font-semibold text-primary sm:text-4xl">{v}</p><p className="mt-1 text-[11px] font-semibold leading-tight text-muted-foreground sm:text-xs">{l}</p></div>)}
        </div>
        <div className="px-5 pb-6 pt-5 sm:px-8 sm:pb-8">
          <p className="text-sm font-semibold">{counts.reached === 0 ? "Você já faz parte, mesmo sem indicações. Se fizer sentido, seu convite pode abrir um novo começo." : `${counts.reached} ${counts.reached === 1 ? "pessoa conheceu" : "pessoas conheceram"} a Olá Aura por você.`}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" asChild><a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" onClick={() => recordEvent("whatsapp_share_started", { message_kind: messageKind })}><MessageCircle /> Enviar no WhatsApp</a></Button>
            <Button variant="secondary" onClick={copy}><Copy /> Copiar convite</Button>
          </div>
          <p className="mt-3 text-[11px] text-primary-foreground/75">Ninguém que recebeu é identificado. Alcançadas abriram o convite; Começaram conversaram; Continuaram seguiram com o acompanhamento.</p>
        </div>
      </section>
      {nextAchievement && <section className="rounded-xl border border-primary/30 bg-card p-5"><div className="flex items-start gap-4"><MovementAchievementSymbol id={nextAchievement.id} index={0} /><div className="w-full"><p className="text-xs font-bold uppercase text-primary">Seu próximo marco</p><div className="mt-1 flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-display text-xl font-semibold">{nextAchievement.name}</h3><p className="text-sm font-semibold">{nextCurrent} de {nextAchievement.threshold}</p></div><Progress value={nextProgress} className="mt-3 h-2" /><p className="mt-3 text-sm text-muted-foreground">{nextAchievement.description}</p></div></div></section>}
      <section className="bg-primary px-5 py-7 text-primary-foreground sm:px-8">
        <p className="text-xs font-bold uppercase">Um próximo gesto, do seu jeito</p>
        <h3 className="mt-3 font-display text-2xl font-semibold sm:text-3xl">Se fizer sentido, abra um caminho.</h3>
        <p className="mt-3 text-sm text-primary-foreground/90">Seu convite, com suas palavras. Sem metas.</p>
        <Button variant="secondary" className="mt-5 h-auto min-h-11 whitespace-normal text-left" onClick={() => document.getElementById("movement-ambassador-kit")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Abrir meu Kit do Embaixador <ArrowRight className="shrink-0" /></Button>
      </section>
      {pendingRecognitions.length > 0 && <section className="space-y-3"><div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Você foi reconhecido</h3></div>{pendingRecognitions.map((recognition) => <article key={recognition.id} className="rounded-lg border border-primary/30 bg-secondary/50 p-5"><p className="text-xs font-bold uppercase text-primary">Voz do Movimento</p><h4 className="mt-2 font-display text-xl font-semibold">{recognition.title}</h4><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{recognition.body}</p><p className="mt-4 text-xs text-muted-foreground">Você decide se este reconhecimento pode aparecer no Mural público.</p><div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => decideRecognition(recognition, "accepted")}><CheckCircle2 /> Autorizar publicação</Button><Button variant="outline" onClick={() => decideRecognition(recognition, "declined")}>Manter privado</Button></div></article>)}</section>}
      {decidedRecognitions.length > 0 && <section><div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Seus reconhecimentos</h3></div><div className="mt-4 space-y-3">{decidedRecognitions.map((recognition) => <article key={recognition.id} className="border-l-2 border-primary bg-secondary/30 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase text-primary">{recognition.kind === "voice" ? "Voz do Movimento" : "Reconhecimento"}</p><p className="text-xs text-muted-foreground">{recognition.consent_decision === "accepted" ? "Autorizado para o Mural" : "Visível somente para você"}</p></div><h4 className="mt-2 font-display text-xl font-semibold">{recognition.title}</h4><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{recognition.body}</p></article>)}</div></section>}
      <section id="movement-ambassador-kit" className="scroll-mt-5">
        <div className="flex items-center gap-3"><Share2 className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Kit do Embaixador</h3></div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Escolha um convite, ajuste com suas palavras e envie com seu link pessoal. Você não precisa baixar nada para indicar alguém.</p>
        <p className="mt-5 text-xs font-bold uppercase text-primary">Mensagens com link pessoal</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2" role="group" aria-label="Sua experiência com a Aura">{Object.entries({ user: "Já uso a Aura", supporter: "Ainda não experimentei" }).map(([key, label]) => <Button key={key} variant={messageKind === key ? "default" : "outline"} aria-pressed={messageKind === key} onClick={() => selectMessage(key as keyof typeof messages)}>{messageKind === key && <Check />} {label}</Button>)}</div>
        <label className="mt-4 block"><span className="mb-2 block text-sm font-semibold">Sua mensagem</span><Textarea value={shareMessage} onChange={(event) => setShareMessage(event.target.value)} maxLength={1200} rows={14} /><span className="mt-2 block break-all text-xs text-primary">{shareUrl}</span></label>
        <div className="mt-3 flex gap-2"><Button onClick={share} disabled={!shareMessage.trim()}><Share2 /> Compartilhar</Button><Button variant="outline" size="icon" aria-label="Copiar convite" title="Copiar convite" onClick={copy} disabled={!shareMessage.trim()}><Copy /></Button><Button variant="outline" size="icon" aria-label="Enviar no WhatsApp" title="Enviar no WhatsApp" asChild><a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" onClick={() => recordEvent("whatsapp_share_started", { message_kind: messageKind })}><MessageCircle /></a></Button></div>
        <div className="mt-6 border-y border-border py-5"><p className="text-xs font-bold uppercase text-muted-foreground">Peças visuais</p><p className="mt-2 font-semibold">Status, Stories e posts serão liberados aqui.</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Esses materiais ainda estão em preparação. Quando estiverem prontos, você poderá compartilhar ou baixar cada peça nesta área.</p></div>
      </section>
      <section><div className="flex items-center gap-3"><History className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Impacto recente</h3></div>{recentImpact.length === 0 ? <div className="mt-4 border-y border-border py-6"><p className="font-semibold">Seu primeiro gesto pode começar agora.</p><p className="mt-1 text-sm text-muted-foreground">Pense em alguém para quem conhecer a Olá Aura poderia fazer sentido e envie do seu jeito.</p></div> : <div className="mt-4 divide-y divide-border border-y border-border">{recentImpact.map((item, index) => <div key={`${item.reached_at}-${index}`} className="flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-semibold">{item.continued_at ? "Uma pessoa decidiu continuar" : item.started_at ? "Uma pessoa começou uma conversa" : "Seu convite foi conhecido"}</p><p className="mt-1 text-xs text-muted-foreground">Sem expor a identidade de quem recebeu.</p></div><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /></div>)}</div>}</section>
      <section>
        <div className="flex items-center gap-3"><Award className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Suas conquistas</h3></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{MOVEMENT_ACHIEVEMENTS.map((achievement, index) => <div key={achievement.id} className={`flex items-start gap-3 rounded-lg border bg-card p-4 ${unlocked(achievement) ? "border-primary/35" : "border-border"}`}><MovementAchievementSymbol id={achievement.id} index={index} /><div><p className="font-semibold">{achievement.name}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{achievement.description}</p><p className="mt-2 text-xs font-semibold text-primary">{unlocked(achievement) ? "Conquistado" : "Ainda por construir"}</p></div></div>)}</div>
      </section>
      <section className="border-t border-border pt-7"><h3 className="font-display text-xl font-semibold">Sua privacidade</h3><div className="mt-4 space-y-4"><label className="flex items-center justify-between gap-4"><span><b className="block text-sm">Mostrar conquistas no Mural</b><span className="text-xs text-muted-foreground">Seu modo de exibição continua sendo respeitado.</span></span><Switch checked={member.show_achievements} onCheckedChange={(v) => updatePreference("show_achievements", v)} /></label><label className="flex items-center justify-between gap-4"><span><b className="block text-sm">Receber novidades do Movimento</b><span className="text-xs text-muted-foreground">Somente atualizações relevantes.</span></span><Switch checked={member.receive_updates} onCheckedChange={(v) => updatePreference("receive_updates", v)} /></label></div></section>
    </div>
  );
}
