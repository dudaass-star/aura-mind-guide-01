import { useEffect, useMemo, useState } from "react";
import { Award, Check, CheckCircle2, Copy, HeartHandshake, History, LockKeyhole, MessageCircle, Share2, Sparkles, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { claimMovementReferral, decideMovementRecognition, MOVEMENT_ACHIEVEMENTS } from "@/lib/movement";
import { toast } from "@/hooks/use-toast";

const messages = {
  personal: "Conheci a Olá Aura e pensei que talvez fizesse sentido para você. É um app para conversar sobre o que está vivendo, compreender padrões e encontrar direção.",
  movement: "Estou participando do Movimento Olá Aura, uma iniciativa para tornar apoio, compreensão e direção mais acessíveis.",
  short: "Acho que você pode gostar de conhecer a Olá Aura. Estou te enviando sem compromisso:",
};

type Member = { id: string; public_name: string; display_mode: string; referral_code: string; show_achievements: boolean; receive_updates: boolean; created_at: string };
type Recognition = { id: string; kind: string; title: string; body: string; status: string; consent_decision: string; created_at: string };
type Props = { userId: string; suggestedName?: string; embedded?: boolean };

export function MovementDashboard({ userId, suggestedName = "", embedded = false }: Props) {
  const [member, setMember] = useState<Member | null>(null);
  const [referrals, setReferrals] = useState<Array<{ reached_at: string; started_at: string | null; continued_at: string | null; is_valid: boolean }>>([]);
  const [recognitions, setRecognitions] = useState<Recognition[]>([]);
  const [name, setName] = useState(suggestedName);
  const [displayMode, setDisplayMode] = useState("first_name");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [messageKind, setMessageKind] = useState<keyof typeof messages>("personal");
  const [shareMessage, setShareMessage] = useState(messages.personal);

  const load = async () => {
    const { data } = await supabasePortal.from("movement_members").select("*").eq("user_id", userId).maybeSingle();
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

  useEffect(() => { void claimMovementReferral().finally(load); }, [userId]);

  const counts = useMemo(() => ({
    reached: referrals.filter((r) => r.is_valid).length,
    started: referrals.filter((r) => r.is_valid && r.started_at).length,
    continued: referrals.filter((r) => r.is_valid && r.continued_at).length,
  }), [referrals]);

  const unlocked = (achievement: typeof MOVEMENT_ACHIEVEMENTS[number]) => {
    if (achievement.metric === "member") return Boolean(member);
    if (achievement.metric === "started") return counts.started >= achievement.threshold;
    if (achievement.metric === "continued") return counts.continued >= achievement.threshold;
    if (achievement.metric === "voice") return recognitions.some((recognition) => recognition.kind === "voice" && recognition.consent_decision === "accepted");
    return false;
  };

  const nextAchievement = MOVEMENT_ACHIEVEMENTS.find((achievement) => !unlocked(achievement) && achievement.metric !== "voice");
  const nextCurrent = nextAchievement?.metric === "continued" ? counts.continued : nextAchievement?.metric === "started" ? counts.started : 0;
  const nextProgress = nextAchievement ? Math.min(100, Math.round((nextCurrent / nextAchievement.threshold) * 100)) : 100;
  const createMember = async () => {
    if (!name.trim() || !accepted) return;
    setSaving(true);
    const { data, error } = await supabasePortal.from("movement_members").insert({ user_id: userId, public_name: name.trim(), display_mode: displayMode }).select("*").single();
    setSaving(false);
    if (error) return toast({ title: "Não conseguimos concluir agora", description: "Tente novamente em instantes.", variant: "destructive" });
    setMember(data);
    toast({ title: "Agora você faz parte", description: "Sua conquista “Eu Faço Parte” já está liberada." });
  };

  const updatePreference = async (field: "show_achievements" | "receive_updates", value: boolean) => {
    if (!member) return;
    setMember({ ...member, [field]: value });
    await supabasePortal.from("movement_members").update({ [field]: value }).eq("id", member.id);
  };

  const recordEvent = (eventType: string, metadata: Record<string, string> = {}) => {
    void supabasePortal.from("portal_value_events").insert({ user_id: userId, feature: "movement", event_type: eventType, source: "app", metadata });
  };

  const decideRecognition = async (recognition: Recognition, decision: "accepted" | "declined") => {
    const result = await decideMovementRecognition(recognition.id, decision);
    if (!result.ok) return toast({ title: "Não conseguimos salvar sua decisão", description: "Tente novamente em instantes.", variant: "destructive" });
    toast({ title: decision === "accepted" ? "Reconhecimento autorizado" : "Publicação recusada", description: decision === "accepted" ? "Ele agora pode aparecer no Mural do Movimento." : "Ele continuará visível somente para você." });
    void load();
  };

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Abrindo o Movimento…</div>;

  if (!member) return (
    <div className="mx-auto max-w-xl py-4">
      <p className="text-xs font-bold uppercase text-primary">Movimento Olá Aura</p>
      <h2 className="mt-3 font-display text-3xl font-semibold">Faça parte de algo que pode chegar muito além de você.</h2>
      <p className="mt-4 leading-relaxed text-muted-foreground">Você não precisa ser cliente, ter seguidores ou vender nada. Basta acreditar que mais pessoas merecem acesso a compreensão e direção.</p>
      <div className="mt-8 space-y-5 border-y border-border py-7">
        <label className="block"><span className="mb-2 block text-sm font-semibold">Como devemos chamar você?</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" /></label>
        <label className="block"><span className="mb-2 block text-sm font-semibold">Como aparecer no Mural?</span><select value={displayMode} onChange={(e) => setDisplayMode(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="first_name">Primeiro nome</option><option value="full_name">Nome completo</option><option value="initials">Iniciais</option><option value="private">Participação privada</option></select></label>
        <label className="flex items-start gap-3"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" /><span className="text-sm leading-relaxed">Quero ajudar essa ideia a chegar a mais pessoas de forma respeitosa, verdadeira e sem pressão.</span></label>
      </div>
      <Button className="mt-6 w-full sm:w-auto" size="lg" disabled={!accepted || !name.trim() || saving} onClick={createMember}><HeartHandshake /> {saving ? "Entrando…" : "Quero fazer parte"}</Button>
    </div>
  );

  const shareUrl = `${window.location.origin}/movimento?por=${member.referral_code}`;
  const shareText = `${shareMessage.trim()} ${shareUrl}`;
  const selectMessage = (kind: keyof typeof messages) => { setMessageKind(kind); setShareMessage(messages[kind]); };
  const copy = async () => { await navigator.clipboard.writeText(shareText); recordEvent("invite_copied", { message_kind: messageKind }); toast({ title: "Convite copiado", description: "Agora é só enviar para quem veio à sua mente." }); };
  const share = async () => { recordEvent("share_started", { message_kind: messageKind }); if (navigator.share) await navigator.share({ title: "Movimento Olá Aura", text: shareMessage.trim(), url: shareUrl }); else await copy(); };
  const pendingRecognitions = recognitions.filter((recognition) => recognition.consent_decision === "pending");
  const decidedRecognitions = recognitions.filter((recognition) => recognition.consent_decision !== "pending");
  const recentImpact = referrals.filter((referral) => referral.is_valid).slice(0, 4);

  return (
    <div className={embedded ? "space-y-8" : "mx-auto max-w-5xl space-y-10 px-5 py-10"}>
      <section className="border-b border-border pb-7">
        <p className="text-xs font-bold uppercase text-primary">Seu impacto</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">Uma possibilidade compartilhada pode ser um começo.</h2>
        <div className="mt-6 grid grid-cols-3 divide-x divide-border border-y border-border py-5 text-center">
          <div><p className="font-display text-3xl font-semibold">{counts.reached}</p><p className="mt-1 text-xs text-muted-foreground">Alcançadas</p></div>
          <div><p className="font-display text-3xl font-semibold">{counts.started}</p><p className="mt-1 text-xs text-muted-foreground">Começaram</p></div>
          <div><p className="font-display text-3xl font-semibold">{counts.continued}</p><p className="mt-1 text-xs text-muted-foreground">Continuaram</p></div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Alcançadas abriram seu convite. Começaram iniciaram uma conversa. Continuaram decidiram seguir com o acompanhamento.</p>
      </section>
      {nextAchievement && <section className="border-l-2 border-primary pl-5"><div className="flex items-start gap-4"><Sprout className="mt-1 h-6 w-6 shrink-0 text-primary" /><div className="w-full"><p className="text-xs font-bold uppercase text-primary">Seu próximo marco</p><div className="mt-1 flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-display text-xl font-semibold">{nextAchievement.name}</h3><p className="text-sm font-semibold">{nextCurrent} de {nextAchievement.threshold}</p></div><Progress value={nextProgress} className="mt-3 h-2" /><p className="mt-3 text-sm text-muted-foreground">{nextAchievement.description}</p></div></div></section>}
      {pendingRecognitions.length > 0 && <section className="space-y-3"><div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Você foi reconhecido</h3></div>{pendingRecognitions.map((recognition) => <article key={recognition.id} className="rounded-lg border border-primary/30 bg-secondary/50 p-5"><p className="text-xs font-bold uppercase text-primary">Voz do Movimento</p><h4 className="mt-2 font-display text-xl font-semibold">{recognition.title}</h4><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{recognition.body}</p><p className="mt-4 text-xs text-muted-foreground">Você decide se este reconhecimento pode aparecer no Mural público.</p><div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => decideRecognition(recognition, "accepted")}><CheckCircle2 /> Autorizar publicação</Button><Button variant="outline" onClick={() => decideRecognition(recognition, "declined")}>Manter privado</Button></div></article>)}</section>}
      {decidedRecognitions.length > 0 && <section><div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Seus reconhecimentos</h3></div><div className="mt-4 space-y-3">{decidedRecognitions.map((recognition) => <article key={recognition.id} className="border-l-2 border-primary bg-secondary/30 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase text-primary">{recognition.kind === "voice" ? "Voz do Movimento" : "Reconhecimento"}</p><p className="text-xs text-muted-foreground">{recognition.consent_decision === "accepted" ? "Autorizado para o Mural" : "Visível somente para você"}</p></div><h4 className="mt-2 font-display text-xl font-semibold">{recognition.title}</h4><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{recognition.body}</p></article>)}</div></section>}
      <section>
        <div className="flex items-center gap-3"><Share2 className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Compartilhe do seu jeito</h3></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">{Object.entries({ personal: "Convite pessoal", movement: "Sobre o Movimento", short: "Mensagem curta" }).map(([key, label]) => <Button key={key} variant={messageKind === key ? "default" : "outline"} onClick={() => selectMessage(key as keyof typeof messages)}>{messageKind === key && <Check />} {label}</Button>)}</div>
        <label className="mt-4 block"><span className="mb-2 block text-sm font-semibold">Sua mensagem</span><Textarea value={shareMessage} onChange={(event) => setShareMessage(event.target.value)} maxLength={500} rows={5} /><span className="mt-2 block break-all text-xs text-primary">{shareUrl}</span></label>
        <div className="mt-3 flex gap-2"><Button onClick={share} disabled={!shareMessage.trim()}><Share2 /> Compartilhar</Button><Button variant="outline" size="icon" aria-label="Copiar convite" title="Copiar convite" onClick={copy} disabled={!shareMessage.trim()}><Copy /></Button><Button variant="outline" size="icon" aria-label="Enviar no WhatsApp" title="Enviar no WhatsApp" asChild><a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" onClick={() => recordEvent("whatsapp_share_started", { message_kind: messageKind })}><MessageCircle /></a></Button></div>
      </section>
      <section><div className="flex items-center gap-3"><History className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Impacto recente</h3></div>{recentImpact.length === 0 ? <div className="mt-4 border-y border-border py-6"><p className="font-semibold">Seu primeiro gesto pode começar agora.</p><p className="mt-1 text-sm text-muted-foreground">Pense em alguém para quem conhecer a Olá Aura poderia fazer sentido e envie do seu jeito.</p></div> : <div className="mt-4 divide-y divide-border border-y border-border">{recentImpact.map((item, index) => <div key={`${item.reached_at}-${index}`} className="flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-semibold">{item.continued_at ? "Uma pessoa decidiu continuar" : item.started_at ? "Uma pessoa começou uma conversa" : "Seu convite foi conhecido"}</p><p className="mt-1 text-xs text-muted-foreground">Sem expor a identidade de quem recebeu.</p></div><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /></div>)}</div>}</section>
      <section>
        <div className="flex items-center gap-3"><Award className="h-5 w-5 text-primary" /><h3 className="font-display text-2xl font-semibold">Suas conquistas</h3></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{MOVEMENT_ACHIEVEMENTS.map((achievement) => <div key={achievement.id} className={`flex gap-3 rounded-lg border p-4 ${unlocked(achievement) ? "border-primary/35 bg-secondary/50" : "border-border opacity-55"}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background">{unlocked(achievement) ? <Award className="h-5 w-5 text-primary" /> : <LockKeyhole className="h-4 w-4" />}</span><div><p className="font-semibold">{achievement.name}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{achievement.description}</p></div></div>)}</div>
      </section>
      <section className="border-t border-border pt-7"><h3 className="font-display text-xl font-semibold">Sua privacidade</h3><div className="mt-4 space-y-4"><label className="flex items-center justify-between gap-4"><span><b className="block text-sm">Mostrar conquistas no Mural</b><span className="text-xs text-muted-foreground">Seu modo de exibição continua sendo respeitado.</span></span><Switch checked={member.show_achievements} onCheckedChange={(v) => updatePreference("show_achievements", v)} /></label><label className="flex items-center justify-between gap-4"><span><b className="block text-sm">Receber novidades do Movimento</b><span className="text-xs text-muted-foreground">Somente atualizações relevantes.</span></span><Switch checked={member.receive_updates} onCheckedChange={(v) => updatePreference("receive_updates", v)} /></label></div></section>
    </div>
  );
}
