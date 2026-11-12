import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Check, ChevronDown, ChevronUp, Compass, Heart, Pencil, PenLine, Plus, ShieldAlert, Sparkles, Trash2, UserRound, Users, X } from "lucide-react";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState, PortalLoadingInline } from "./shared";
import { sanitizePortalText } from "./sanitize";
import { toast } from "@/hooks/use-toast";

// Retrato atual do cliente. Fatos declarados e leituras da AURA ficam separados:
// fatos podem ser editados; leituras precisam de confirmação antes de virarem referência validada.
type Portrait = {
  user_id: string;
  intro: string | null;
  pessoas: { label: string; names: string[]; nota?: string | null }[];
  o_que_te_move: string[];
  padroes: string[];
  preferencias: string[];
  sensiveis: string[];
  generated_at: string;
};

type Feedback = { item_key: string; section: string; original_text: string; status: "confirmed" | "corrected" | "removed"; corrected_text: string | null };
type UserFact = { id: string; key: string; value: string; created_at: string | null; declared_category?: string | null };
type SectionKey = "intro" | "pessoas" | "o_que_te_move" | "padroes" | "preferencias" | "sensiveis";
type ReviewItem = { section: SectionKey; text: string };

const PROMPTS = [
  { id: "objetivo", label: "Um objetivo importante", placeholder: "Onde eu quero chegar…" },
  { id: "desafio", label: "Um desafio atual", placeholder: "O que estou enfrentando agora…" },
  { id: "valor", label: "Um valor inegociável", placeholder: "Uma coisa que eu não abro mão…" },
  { id: "medo", label: "Um medo ou receio", placeholder: "Uma coisa que me trava…" },
  { id: "aspiracao", label: "Quem quero me tornar", placeholder: "A pessoa que quero me tornar…" },
  { id: "sobre_mim", label: "Outra coisa", placeholder: "O que a AURA deveria saber?" },
] as const;

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
async function feedbackKey(section: string, text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${section}:${normalize(text)}`));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function SobreVoceTab({ userId, profile, onOpenConversation }: { userId: string; profile: { name?: string | null } | null | undefined; onOpenConversation: (prefilledMessage?: string) => void }) {
  const queryClient = useQueryClient();
  const [review, setReview] = useState<ReviewItem | null>(null);
  const [correction, setCorrection] = useState("");
  const [sensitiveOpen, setSensitiveOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["portal-user-portrait-view", userId],
    queryFn: async () => {
      const [portraitRes, factsRes, feedbackRes] = await Promise.all([
        supabasePortal.from("user_portraits").select("*").eq("user_id", userId).maybeSingle(),
        supabasePortal.from("user_insights").select("id,key,value,created_at,declared_category").eq("user_id", userId).eq("source_kind", "user_declared").order("created_at", { ascending: false }),
        supabasePortal.from("user_portrait_feedback").select("item_key,section,original_text,status,corrected_text").eq("user_id", userId),
      ]);
      if (portraitRes.error) throw portraitRes.error;
      if (factsRes.error) throw factsRes.error;
      if (feedbackRes.error) throw feedbackRes.error;
      return { portrait: portraitRes.data as unknown as Portrait | null, facts: (factsRes.data ?? []) as UserFact[], feedback: (feedbackRes.data ?? []) as unknown as Feedback[] };
    },
    enabled: Boolean(userId),
  });

  const refreshPortrait = async (force = false) => {
    const { error } = await supabasePortal.functions.invoke("generate-user-portrait", { body: { force } });
    if (error) throw error;
    await refetch();
  };

  useEffect(() => {
    if (!userId || isLoading) return;
    void refreshPortrait(false).catch(() => undefined);
    // A identidade da conta não muda durante a montagem desta área.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isLoading]);

  const feedbackMap = useMemo(() => new Map((data?.feedback ?? []).map((item) => [item.item_key, item])), [data?.feedback]);
  const firstName = profile?.name?.trim().split(/\s+/)[0];
  const portrait = data?.portrait;
  const facts = (data?.facts ?? []).map((fact) => ({ ...fact, key: fact.key.replace(/^Declarado ·\s*/, "") }));
  const hasPortrait = Boolean(portrait?.intro || portrait?.pessoas?.length || portrait?.o_que_te_move?.length || portrait?.padroes?.length || portrait?.preferencias?.length || portrait?.sensiveis?.length);

  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data: response, error } = await supabasePortal.functions.invoke("manage-user-portrait", { body });
      if (error) throw error;
      if (response?.error) throw new Error(response.error);
      return response;
    },
    onSuccess: async (_, variables) => {
      setReview(null);
      setCorrection("");
      await queryClient.invalidateQueries({ queryKey: ["portal-user-portrait-view", userId] });
      if (variables.action !== "confirm") {
        try {
          await refreshPortrait(true);
        } catch {
          toast({ title: "Mudança salva", description: "O retrato será atualizado automaticamente quando a conexão voltar." });
        }
      }
    },
    onError: () => toast({ title: "Não foi possível salvar agora", description: "Tente novamente em instantes.", variant: "destructive" }),
  });

  const reviewMutation = async (action: "confirm" | "correct" | "remove", item: ReviewItem, correctedText?: string) => {
    mutation.mutate({ action, section: item.section, originalText: item.text, ...(correctedText ? { correctedText } : {}) }, {
      onSuccess: () => toast({
        title: action === "confirm" ? "Confirmado por você" : action === "correct" ? "Leitura corrigida" : "Leitura removida",
        description: action === "confirm" ? "A AURA pode usar isso como referência validada." : "Sua versão passa a valer a partir de agora.",
      }),
    });
  };

  if (isLoading) return <PortalLoadingInline />;

  return <div className="portal-area-page space-y-7">
    {!hasPortrait ? <EmptyState icon={Heart} title="A AURA ainda está te conhecendo" description="Quando houver material suficiente, as primeiras leituras aparecem aqui para você confirmar." /> : <>
      {(portrait?.intro || portrait?.o_que_te_move?.length) ? <section className="sobre-glass sobre-glass-sage space-y-4 rounded-3xl p-6"><div className="flex items-center gap-2"><Compass className="sobre-eyebrow h-4 w-4" /><p className="sobre-eyebrow text-[11px] font-bold uppercase">O que importa para você agora</p></div>{portrait?.intro && <HypothesisContent mode="adjust" lead firstName={firstName} item={{ section: "intro", text: portrait.intro }} feedbackMap={feedbackMap} busy={mutation.isPending} onConfirm={reviewMutation} onReview={(item) => { setReview(item); setCorrection(""); }} />}{portrait?.o_que_te_move?.map((text) => <div key={text} className="border-t border-white/10 pt-3"><HypothesisContent mode="adjust" item={{ section: "o_que_te_move", text }} feedbackMap={feedbackMap} busy={mutation.isPending} onConfirm={reviewMutation} onReview={(item) => { setReview(item); setCorrection(""); }} /></div>)}</section> : null}
      {portrait?.pessoas?.length ? <Section title="Pessoas da sua vida" icon={Users}>{portrait.pessoas.map((person, index) => {
        const text = [person.label, ...(person.names ?? []), person.nota].filter(Boolean).join(" · ");
        return <HypothesisRow mode="fact" key={`${text}-${index}`} person={person} item={{ section: "pessoas", text }} feedbackMap={feedbackMap} busy={mutation.isPending} onConfirm={reviewMutation} onReview={(item) => { setReview(item); setCorrection(""); }} />;
      })}</Section> : null}
      {portrait?.padroes?.length ? <Section title="O que a AURA percebeu" icon={Sparkles}>{portrait.padroes.map((text) => <HypothesisRow key={text} item={{ section: "padroes", text }} feedbackMap={feedbackMap} busy={mutation.isPending} onConfirm={reviewMutation} onReview={(item) => { setReview(item); setCorrection(""); }} />)}</Section> : null}
      {portrait?.preferencias?.length ? <Section title="Preferências e rotina" icon={Heart}>{portrait.preferencias.map((text) => <HypothesisRow mode="fact" key={text} item={{ section: "preferencias", text }} feedbackMap={feedbackMap} busy={mutation.isPending} onConfirm={reviewMutation} onReview={(item) => { setReview(item); setCorrection(""); }} />)}</Section> : null}
      {portrait?.sensiveis?.length ? <section className="space-y-3"><Button variant="ghost" className="h-auto w-full justify-start gap-2 px-0 text-left" onClick={() => setSensitiveOpen((open) => !open)}><ShieldAlert className="sobre-eyebrow h-4 w-4" /><span className="flex-1 text-sm font-semibold sobre-text">Pontos sensíveis</span>{sensitiveOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button>{sensitiveOpen && <div className="sobre-glass sobre-group rounded-3xl px-5 py-1">{portrait.sensiveis.map((text) => <HypothesisRow key={text} item={{ section: "sensiveis", text }} feedbackMap={feedbackMap} busy={mutation.isPending} onConfirm={reviewMutation} onReview={(item) => { setReview(item); setCorrection(""); }} />)}</div>}</section> : null}
    </>}

    {addOpen ? <>
      <FactContribution facts={facts} busy={mutation.isPending} onAction={async (body) => {
      try {
        await mutation.mutateAsync(body);
        toast({ title: body.action === "add_fact" ? "Guardado" : body.action === "edit_fact" ? "Atualizado" : "Apagado", description: "A AURA passa a considerar essa mudança nas próximas conversas." });
        return true;
      } catch {
        return false;
      }
    }} />
      <Button variant="ghost" className="sobre-btn-ghost w-full rounded-full" onClick={() => setAddOpen(false)}>Fechar</Button>
    </> : <section className="sobre-glass space-y-3 rounded-3xl p-5 text-center"><h3 className="text-lg sobre-text" style={{ fontFamily: "var(--font-display)" }}>Quer que a AURA leve mais alguma coisa em conta?</h3><Button variant="outline" className="sobre-btn-confirm rounded-full" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Adicionar algo sobre mim</Button>{facts.length > 0 && <p className="sobre-muted text-xs">{facts.length} {facts.length === 1 ? "coisa contada" : "coisas contadas"} por você</p>}</section>}

    <p className="sobre-glass sobre-muted rounded-2xl p-4 text-xs leading-relaxed"><strong className="sobre-text">Tudo aqui é seu.</strong> Se algo não combina com você, ajuste ou apague — a AURA passa a considerar a sua versão.</p>

    <Button className="h-12 w-full rounded-full" onClick={() => {
      void supabasePortal.from("portal_value_events").insert({ user_id: userId, feature: "profile", event_type: "returned_to_conversation", source: "app" });
      onOpenConversation();
    }}>Conversar com a AURA</Button>

    <Dialog open={Boolean(review)} onOpenChange={(open) => { if (!open) { setReview(null); setCorrection(""); } }}>
      <DialogContent className="max-w-md rounded-xl">
        <DialogHeader><DialogTitle>O que não ficou certo?</DialogTitle><DialogDescription>Escreva como você prefere que a AURA entenda isso.</DialogDescription></DialogHeader>
        <div className="rounded-lg bg-secondary/60 p-3 text-sm text-muted-foreground">“{review?.text}”</div>
        <Textarea value={correction} onChange={(event) => setCorrection(event.target.value)} maxLength={800} placeholder="Na verdade…" />
        <DialogFooter className="gap-2 sm:space-x-0"><Button variant="ghost" className="text-destructive" disabled={mutation.isPending} onClick={() => review && void reviewMutation("remove", review)}>Apagar leitura</Button><Button disabled={!correction.trim() || mutation.isPending} onClick={() => review && void reviewMutation("correct", review, correction.trim())}>Salvar minha versão</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return <section className="space-y-3"><div className="flex items-center gap-2.5"><span className="sobre-icon flex h-8 w-8 items-center justify-center rounded-full"><Icon className="h-4 w-4" /></span><h3 className="text-xl sobre-text" style={{ fontFamily: "var(--font-display)" }}>{title}</h3></div><div className="sobre-glass sobre-group rounded-3xl px-5 py-1">{children}</div></section>;
}

function HypothesisCard(props: HypothesisProps & { title: string }) {
  return <section className="sobre-glass sobre-glass-hero rounded-3xl p-6"><div className="relative z-10"><div className="mb-3 flex items-center gap-2"><Sparkles className="sobre-eyebrow h-4 w-4" /><p className="sobre-eyebrow text-[11px] font-bold uppercase">{props.title}</p></div><span aria-hidden className="sobre-quote-mark block text-5xl leading-none">“</span><HypothesisContent {...props} quote /></div></section>;
}
function HypothesisRow(props: HypothesisProps) { return <article className="sobre-group-row py-4"><HypothesisContent {...props} /></article>; }
type Person = { label: string; names: string[]; nota?: string | null };
type HypothesisProps = { mode?: "hypothesis" | "fact" | "adjust"; lead?: boolean; firstName?: string; person?: Person; quote?: boolean; item: ReviewItem; feedbackMap: Map<string, Feedback>; busy: boolean; onConfirm: (action: "confirm", item: ReviewItem) => void; onReview: (item: ReviewItem) => void };
function HypothesisContent({ item, feedbackMap, busy, onConfirm, onReview, person, quote, mode = "hypothesis", lead, firstName }: HypothesisProps) {
  const [feedback, setFeedback] = useState<Feedback | undefined>();
  useEffect(() => {
    let current = true;
    void feedbackKey(item.section, item.text).then((key) => {
      if (!current) return;
      const direct = feedbackMap.get(key);
      const corrected = [...feedbackMap.values()].find((entry) => entry.status === "corrected" && normalize(entry.corrected_text ?? "") === normalize(item.text));
      setFeedback(direct ?? corrected);
    });
    return () => { current = false; };
  }, [feedbackMap, item.section, item.text]);
  if (feedback?.status === "removed") return null;
  const display = feedback?.status === "corrected" && feedback.corrected_text ? feedback.corrected_text : item.text;
  const showPerson = person && display === item.text;
  return <div className="space-y-3">{showPerson ? <div><div className="flex flex-wrap items-center gap-2"><span className="sobre-chip rounded-full px-2.5 py-0.5 text-[11px] font-semibold">{person.label}</span>{person.names?.length ? <span className="text-lg sobre-text" style={{ fontFamily: "var(--font-display)" }}>{person.names.join(", ")}</span> : null}</div>{person.nota ? <p className="sobre-muted mt-2 text-sm leading-relaxed">{sanitizePortalText(person.nota)}</p> : null}</div> : <p className={lead ? "text-[1.2rem] leading-relaxed sobre-text" : quote ? "-mt-3 text-[1.15rem] leading-relaxed sobre-text" : "text-sm leading-relaxed sobre-text"} style={lead || quote ? { fontFamily: "var(--font-display)" } : undefined}>{lead && firstName ? `${firstName}, ${sanitizePortalText(display).replace(/^./, (c) => c.toLowerCase())}` : sanitizePortalText(display)}</p>}{mode !== "hypothesis" ? <div className="flex justify-end"><Button size="sm" variant="ghost" className="sobre-btn-ghost h-7 rounded-full px-3 text-xs" disabled={busy} onClick={() => onReview(item)}><Pencil className="h-3 w-3" /> {mode === "fact" ? "Editar" : "Quero ajustar"}</Button></div> : feedback ? <Badge className="sobre-chip gap-1"><Check className="h-3 w-3" />{feedback.status === "confirmed" ? "Confirmado por você" : "Atualizado por você"}</Badge> : <div className="flex flex-wrap items-center gap-2 pt-1"><Button size="sm" variant="outline" className="sobre-btn-confirm rounded-full" disabled={busy} onClick={() => onConfirm("confirm", item)}><Check className="h-3.5 w-3.5" /> Faz sentido</Button><Button size="sm" variant="ghost" className="sobre-btn-ghost rounded-full" disabled={busy} onClick={() => onReview(item)}>Quero ajustar</Button></div>}</div>;
}

function FactContribution({ facts, busy, onAction }: { facts: UserFact[]; busy: boolean; onAction: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [promptIndex, setPromptIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<UserFact | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deleting, setDeleting] = useState<UserFact | null>(null);
  const prompt = PROMPTS[promptIndex % PROMPTS.length];
  return <section className="sobre-glass space-y-4 rounded-3xl p-5">
    <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center sobre-icon rounded-full"><PenLine className="h-4 w-4" /></span><div><p className="sobre-eyebrow text-[11px] font-bold uppercase">Nas suas palavras</p><h3 className="mt-1 text-lg sobre-text" style={{ fontFamily: "var(--font-display)" }}>Tem algo importante que a AURA ainda não sabe?</h3><p className="sobre-muted mt-1 text-sm">Isso evita que você precise explicar de novo nas próximas conversas.</p></div></div>
    {facts.length > 0 && <div className="space-y-2">{facts.map((fact) => <div key={fact.id} className="flex items-start gap-2 sobre-inset rounded-xl p-3"><div className="min-w-0 flex-1"><Badge className="sobre-chip mb-1">Contado por você</Badge>{editing?.id === fact.id ? <Textarea autoFocus value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={800} className="sobre-field mt-2" /> : <p className="text-sm leading-relaxed sobre-text"><strong>{fact.key}:</strong> {sanitizePortalText(fact.value)}</p>}</div>{editing?.id === fact.id ? <div className="flex gap-1"><Button size="icon" className="h-8 w-8" aria-label="Salvar" disabled={busy || !editDraft.trim()} onClick={async () => { if (await onAction({ action: "edit_fact", insightId: fact.id, value: editDraft.trim() })) setEditing(null); }}><Check className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="sobre-btn-ghost h-8 w-8" aria-label="Cancelar" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button></div> : <div className="flex gap-1"><Button size="icon" variant="ghost" className="sobre-btn-ghost h-8 w-8" aria-label="Editar" onClick={() => { setEditing(fact); setEditDraft(fact.value); }}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Apagar" onClick={() => setDeleting(fact)}><Trash2 className="h-4 w-4" /></Button></div>}</div>)}</div>}
    <div className="sobre-inset rounded-2xl p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold sobre-text">{prompt.label}</p><Button variant="ghost" size="sm" className="sobre-btn-ghost rounded-full" onClick={() => { setPromptIndex((index) => index + 1); setDraft(""); }}>Outra pergunta</Button></div><Textarea className="sobre-field mt-2" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={800} placeholder={prompt.placeholder} /><Button className="mt-3 w-full rounded-full" disabled={busy || !draft.trim()} onClick={async () => { if (await onAction({ action: "add_fact", category: prompt.id, value: draft.trim() })) { setDraft(""); setPromptIndex((index) => index + 1); } }}><Plus className="h-4 w-4" /> Guardar para próximas conversas</Button></div>
    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Apagar esta informação?</AlertDialogTitle><AlertDialogDescription>A AURA vai deixar de considerar “{deleting?.value}” nas próximas conversas.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => { if (deleting) onAction({ action: "delete_fact", insightId: deleting.id }); setDeleting(null); }}>Apagar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
