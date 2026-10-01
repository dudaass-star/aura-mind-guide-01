import { useEffect, useMemo, useState } from "react";
import { Award, Eye, EyeOff, HeartHandshake, Loader2, Plus, RefreshCw, ShieldCheck, Users } from "lucide-react";
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

export default function AdminMovement() {
  const { isLoading: authLoading, isAdmin, userId, redirectIfNotAdmin } = useAdminAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [recognitions, setRecognitions] = useState<Recognition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

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
    <section><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Participantes</h2><Button variant="outline" size="icon" onClick={load} aria-label="Atualizar"><RefreshCw /></Button></div><div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Participante</th><th className="p-3">Alcançadas</th><th className="p-3">Começaram</th><th className="p-3">Continuaram</th><th className="p-3">Situação</th><th className="p-3 text-right">Ação</th></tr></thead><tbody>{members.map((member)=>{const impact=memberImpact(member.id);return <tr key={member.id} className="border-t"><td className="p-3 font-medium">{member.public_name}<span className="block text-xs font-normal text-muted-foreground">{member.display_mode === "private" ? "Participação privada" : `Link · ${member.referral_code}`}</span></td><td className="p-3">{impact.reached}</td><td className="p-3">{impact.started}</td><td className="p-3">{impact.continued}</td><td className="p-3">{member.status === "active" ? "Ativo" : "Bloqueado"}</td><td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={()=>updateMember(member,member.status === "active" ? "blocked" : "active")}>{member.status === "active" ? "Bloquear" : "Reativar"}</Button></td></tr>})}</tbody></table></div></section>
    <section className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]"><div className="rounded-lg border bg-card p-5"><div className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary"/><h2 className="text-xl font-semibold">Novo reconhecimento</h2></div><div className="mt-5 space-y-4"><Select value={selectedMember} onValueChange={setSelectedMember}><SelectTrigger><SelectValue placeholder="Escolha o participante"/></SelectTrigger><SelectContent>{members.filter((m)=>m.status==="active").map((m)=><SelectItem key={m.id} value={m.id}>{m.public_name}</SelectItem>)}</SelectContent></Select><Input placeholder="Título do reconhecimento" value={title} onChange={(e)=>setTitle(e.target.value)} maxLength={100}/><Textarea placeholder="Escreva por que essa contribuição merece reconhecimento." value={body} onChange={(e)=>setBody(e.target.value)} maxLength={500}/><Button onClick={createRecognition} disabled={!selectedMember || title.trim().length<2 || body.trim().length<2}>Enviar para aprovação</Button><p className="text-xs text-muted-foreground">O reconhecimento só aparecerá no Mural depois que o participante autorizar.</p></div></div><div><h2 className="text-xl font-semibold">Moderação do Mural</h2><div className="mt-4 space-y-3">{recognitions.length===0?<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum reconhecimento criado ainda.</p>:recognitions.map((item)=><article key={item.id} className="rounded-lg border bg-card p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase text-primary">{item.status === "published" ? "Publicado com autorização" : item.consent_decision === "declined" ? "Publicação recusada" : item.status === "hidden" ? "Oculto" : "Aguardando autorização"}</p><h3 className="mt-1 font-semibold">{item.title}</h3><p className="mt-2 text-sm text-muted-foreground">{item.body}</p></div>{item.status === "published" && <Button variant="outline" size="icon" aria-label="Ocultar" onClick={()=>hideRecognition(item)}><EyeOff/></Button>}</div></article>)}</div></div></section>
  </div>;
}
