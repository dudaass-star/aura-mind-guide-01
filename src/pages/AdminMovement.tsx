import { useEffect, useMemo, useState } from "react";
import { Award, EyeOff, HeartHandshake, Loader2, Plus, RefreshCw, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

type Member = { id: string; public_name: string; display_mode: string; referral_code: string; status: string; created_at: string; show_achievements: boolean };
type Referral = { member_id: string; started_at: string | null; continued_at: string | null; is_valid: boolean };
type Recognition = { id: string; member_id: string; kind: string; title: string; body: string; status: string; consent_decision: string; created_at: string };

const muralPreview = [
  { name: "Marina", title: "Uma conversa virou um novo começo", body: "Ao compartilhar a Olá Aura com alguém próximo, Marina ajudou uma pessoa a encontrar um espaço de escuta em um momento importante." },
  { name: "R. S.", title: "Presença que chegou na hora certa", body: "Um convite feito com cuidado abriu caminho para uma primeira conversa — sem pressão e respeitando o tempo de quem recebeu." },
  { name: "Ana", title: "Voz do Movimento", body: "Ana vem fortalecendo a ideia de que compreender a si mesmo precisa ser uma possibilidade mais próxima da vida real." },
];

export default function AdminMovement() {
  const { isLoading: authLoading, isAdmin, userId, redirectIfNotAdmin } = useAdminAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [recognitions, setRecognitions] = useState<Recognition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [muralPreviewMode, setMuralPreviewMode] = useState<"filled" | "empty">("filled");

  const load = async () => {
    setLoading(true);
    const [memberResult, referralResult, recognitionResult] = await Promise.all([
      supabase.from("movement_members").select("id,public_name,display_mode,referral_code,status,created_at,show_achievements").order("created_at", { ascending: false }),
      supabase.from("movement_referrals").select("member_id,started_at,continued_at,is_valid"),
      supabase.from("movement_recognitions").select("id,member_id,kind,title,body,status,consent_decision,created_at").order("created_at", { ascending: false }),
    ]);
    setMembers(memberResult.data || []);
    setReferrals(referralResult.data || []);
    setRecognitions(recognitionResult.data || []);
    setLoading(false);
  };

  useEffect(() => { if (!authLoading) redirectIfNotAdmin(); }, [authLoading, isAdmin]);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  const totals = useMemo(() => ({
    reached: referrals.filter((r) => r.is_valid).length,
    started: referrals.filter((r) => r.is_valid && r.started_at).length,
    continued: referrals.filter((r) => r.is_valid && r.continued_at).length,
  }), [referrals]);

  const memberImpact = (memberId: string) => {
    const rows = referrals.filter((r) => r.member_id === memberId && r.is_valid);
    return { reached: rows.length, started: rows.filter((r) => r.started_at).length, continued: rows.filter((r) => r.continued_at).length };
  };

  const createRecognition = async () => {
    if (!selectedMember || !title.trim() || !body.trim()) return;
    const { error } = await supabase.from("movement_recognitions").insert({ member_id: selectedMember, kind: "voice", title: title.trim(), body: body.trim(), status: "draft", created_by: userId });
    if (error) return toast({ title: "Não foi possível criar", variant: "destructive" });
    setTitle(""); setBody(""); setSelectedMember("");
    toast({ title: "Reconhecimento salvo como rascunho" });
    void load();
  };

  const hideRecognition = async (item: Recognition) => {
    const { error } = await supabase.from("movement_recognitions").update({ status: "hidden", published_at: null }).eq("id", item.id);
    if (!error) { toast({ title: "Retirado do Mural" }); void load(); }
  };

  const updateMember = async (member: Member, status: "active" | "blocked") => {
    const { error } = await supabase.from("movement_members").update({ status }).eq("id", member.id);
    if (!error) { toast({ title: status === "active" ? "Participação reativada" : "Participação bloqueada" }); void load(); }
  };

  if (authLoading || loading) return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!isAdmin) return null;

  return <div className="mx-auto max-w-7xl space-y-8 p-5 sm:p-8">
    <header><p className="text-xs font-bold uppercase text-primary">Movimento Olá Aura</p><h1 className="mt-2 text-3xl font-semibold">Impacto e reconhecimento</h1><p className="mt-2 text-sm text-muted-foreground">Acompanhe marcos reais, modere o Mural e reconheça contribuições sem criar competição.</p></header>
    <section className="grid gap-3 sm:grid-cols-4">{[{label:"Participantes",value:members.filter((m)=>m.status==="active").length,icon:Users},{label:"Alcançadas",value:totals.reached,icon:HeartHandshake},{label:"Começaram",value:totals.started,icon:Award},{label:"Continuaram",value:totals.continued,icon:ShieldCheck}].map(({label,value,icon:Icon})=><div key={label} className="rounded-lg border bg-card p-5"><Icon className="h-5 w-5 text-primary"/><p className="mt-4 text-3xl font-semibold">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div>)}</section>
    <section className="overflow-hidden rounded-lg border border-primary/30 bg-card">
      <div className="flex flex-col gap-4 border-b border-border bg-secondary/45 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase text-primary">Prévia privada · não publicada</p><h2 className="mt-1 font-display text-2xl font-semibold">Mural do Movimento</h2><p className="mt-1 text-sm text-muted-foreground">Visualize como o Mural ficará antes de usar histórias reais.</p></div><div className="flex gap-2"><Button type="button" size="sm" variant={muralPreviewMode === "filled" ? "default" : "outline"} onClick={() => setMuralPreviewMode("filled")}>Preenchido</Button><Button type="button" size="sm" variant={muralPreviewMode === "empty" ? "default" : "outline"} onClick={() => setMuralPreviewMode("empty")}>Vazio</Button></div></div>
      <div className="p-5 sm:p-8"><div className="max-w-2xl"><p className="text-xs font-bold uppercase text-primary">Mural do Movimento</p><h3 className="mt-3 font-display text-3xl font-semibold">Histórias e gestos que merecem ser reconhecidos.</h3><p className="mt-3 leading-relaxed text-muted-foreground">Cada história aparece somente depois da autorização de quem foi reconhecido.</p></div>{muralPreviewMode === "filled" ? <div className="mt-7 grid gap-4 md:grid-cols-3">{muralPreview.map((item) => <article key={item.title} className="rounded-lg border border-border bg-background p-5"><Sparkles className="h-5 w-5 text-primary" /><p className="mt-4 text-xs font-bold text-primary">{item.name}</p><h4 className="mt-2 font-display text-xl font-semibold">{item.title}</h4><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p></article>)}</div> : <div className="mt-7 border-y border-border py-8"><Sparkles className="h-6 w-6 text-primary" /><p className="mt-3 font-display text-xl font-semibold">As primeiras histórias ainda estão sendo construídas.</p><p className="mt-1 text-sm text-muted-foreground">Quando uma pessoa autorizar seu reconhecimento, ele poderá aparecer aqui.</p></div>}<p className="mt-5 text-xs font-semibold text-muted-foreground">Os nomes e textos desta prévia são demonstrativos e não são gravados nem exibidos aos clientes.</p></div>
    </section>
    <section><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Participantes</h2><Button variant="outline" size="icon" onClick={load} aria-label="Atualizar"><RefreshCw /></Button></div><div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Participante</th><th className="p-3">Alcançadas</th><th className="p-3">Começaram</th><th className="p-3">Continuaram</th><th className="p-3">Situação</th><th className="p-3 text-right">Ação</th></tr></thead><tbody>{members.map((member)=>{const impact=memberImpact(member.id);return <tr key={member.id} className="border-t"><td className="p-3 font-medium">{member.public_name}<span className="block text-xs font-normal text-muted-foreground">{member.display_mode === "private" ? "Participação privada" : `Link · ${member.referral_code}`}</span></td><td className="p-3">{impact.reached}</td><td className="p-3">{impact.started}</td><td className="p-3">{impact.continued}</td><td className="p-3">{member.status === "active" ? "Ativo" : "Bloqueado"}</td><td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={()=>updateMember(member,member.status === "active" ? "blocked" : "active")}>{member.status === "active" ? "Bloquear" : "Reativar"}</Button></td></tr>})}</tbody></table></div></section>
    <section className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]"><div className="rounded-lg border bg-card p-5"><div className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary"/><h2 className="text-xl font-semibold">Novo reconhecimento</h2></div><div className="mt-5 space-y-4"><Select value={selectedMember} onValueChange={setSelectedMember}><SelectTrigger><SelectValue placeholder="Escolha o participante"/></SelectTrigger><SelectContent>{members.filter((m)=>m.status==="active").map((m)=><SelectItem key={m.id} value={m.id}>{m.public_name}</SelectItem>)}</SelectContent></Select><Input placeholder="Título do reconhecimento" value={title} onChange={(e)=>setTitle(e.target.value)} maxLength={100}/><Textarea placeholder="Escreva por que essa contribuição merece reconhecimento." value={body} onChange={(e)=>setBody(e.target.value)} maxLength={500}/><Button onClick={createRecognition} disabled={!selectedMember || title.trim().length<2 || body.trim().length<2}>Enviar para aprovação</Button><p className="text-xs text-muted-foreground">O reconhecimento só aparecerá no Mural depois que o participante autorizar.</p></div></div><div><h2 className="text-xl font-semibold">Moderação do Mural</h2><div className="mt-4 space-y-3">{recognitions.length===0?<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum reconhecimento criado ainda.</p>:recognitions.map((item)=><article key={item.id} className="rounded-lg border bg-card p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase text-primary">{item.status === "published" ? "Publicado com autorização" : item.consent_decision === "declined" ? "Publicação recusada" : item.status === "hidden" ? "Oculto" : "Aguardando autorização"}</p><h3 className="mt-1 font-semibold">{item.title}</h3><p className="mt-2 text-sm text-muted-foreground">{item.body}</p></div>{item.status === "published" && <Button variant="outline" size="icon" aria-label="Ocultar" onClick={()=>hideRecognition(item)}><EyeOff/></Button>}</div></article>)}</div></div></section>
  </div>;
}
