import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Headphones, Search, CheckCircle2, Moon, Wind, Focus, Play, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PortalLoadingInline } from "./shared";
import { MeditationPlayer, type MeditationTrack } from "./MeditationPlayer";
import restImage from "@/assets/meditation-rest.jpg";
import presenceImage from "@/assets/meditation-presence.jpg";
import { reportPushConversion } from "@/lib/push-notifications";
import { reportTodayDirectionProgress } from "@/lib/today-direction";

interface MeditacoesTabProps {
  userId?: string;
  isActive?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  ansiedade: "Ansiedade",
  sono: "Sono",
  foco: "Foco",
  estresse: "Estresse",
  autocompaixao: "Autocompaixão",
  geral: "Geral",
};

export function MeditacoesTab({ userId, isActive = true }: MeditacoesTabProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [duration, setDuration] = useState<string>("all");
  const [selected, setSelected] = useState<MeditationTrack | null>(null);
  useEffect(() => { if (!isActive) setSelected(null); }, [isActive]);
  const trackedAudios = useRef(new Set<string>());

  const recordAudioStarted = (meditationId: string) => {
    if (!userId || trackedAudios.current.has(meditationId)) return;
    trackedAudios.current.add(meditationId);
    void supabasePortal.from("portal_value_events").insert({ user_id: userId, feature: "practice", event_type: "audio_started", source: "app", metadata: { meditation_id: meditationId } });
    void reportPushConversion("/meu-espaco?tab=meditacoes", "first14_practice");
    reportTodayDirectionProgress(userId, "completed", "practice");
  };

  const { data: meditations, isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-all-meditations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meditations")
        .select("id, title, category, duration_seconds, description")
        .eq("is_active", true)
        .order("category")
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: audios, isLoading: audioLoading, isError: audioError, refetch: refetchAudios } = useQuery({
    queryKey: ["portal-meditation-audios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meditation_audios")
        .select("meditation_id, public_url");
      if (error) throw error;
      return data;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["portal-meditation-history", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabasePortal
        .from("user_meditation_history")
        .select("meditation_id, sent_at")
        .eq("user_id", userId)
        .order("sent_at", { ascending: false })
        .limit(500);
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
  });

  const audioMap = useMemo(
    () => new Map((audios || []).map((a: any) => [a.meditation_id, a.public_url])),
    [audios],
  );
  const heardSet = useMemo(
    () => new Set((history || []).map((h: any) => h.meditation_id)),
    [history],
  );
  const withAudio = useMemo(
    () => (meditations || []).filter((m: any) => audioMap.has(m.id)),
    [meditations, audioMap],
  );

  const allCategories = useMemo(
    () => Array.from(new Set(withAudio.map((m: any) => (m.category || "geral").toLowerCase()))),
    [withAudio],
  );

  // Sugeridas pra você: prioriza categoria mais ouvida; preenche com não ouvidas.
  const suggested = useMemo(() => {
    if (!userId || withAudio.length === 0) return [];
    const countByCat: Record<string, number> = {};
    for (const m of withAudio) {
      if (!heardSet.has(m.id)) continue;
      const c = (m.category || "geral").toLowerCase();
      countByCat[c] = (countByCat[c] || 0) + 1;
    }
    const preferredCat = Object.entries(countByCat).sort((a, b) => b[1] - a[1])[0]?.[0];
    const notHeard = withAudio.filter((m: any) => !heardSet.has(m.id));
    const pool = preferredCat
      ? notHeard.filter((m: any) => (m.category || "geral").toLowerCase() === preferredCat)
      : notHeard;
    const merged = pool.length >= 3
      ? pool
      : [...pool, ...notHeard.filter((m: any) => !pool.includes(m))];
    return merged.slice(0, 3);
  }, [withAudio, heardSet, userId]);

  if (isLoading || audioLoading) return <PortalLoadingInline />;
  if (isError || audioError) return <div className="space-y-3 py-8 text-center"><p className="text-sm text-muted-foreground">Não foi possível carregar as meditações.</p><Button variant="outline" onClick={() => { void refetch(); void refetchAudios(); }}>Tentar novamente</Button></div>;

  if (withAudio.length === 0) {
    return (
      <EmptyState
        icon={Headphones}
        title="Nenhuma meditação disponível"
        description="As meditações estarão disponíveis em breve!"
      />
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = withAudio.filter((m: any) => {
    const cat = (m.category || "geral").toLowerCase();
    if (category !== "all" && cat !== category) return false;
    const mins = Math.round((m.duration_seconds || 0) / 60);
    if (duration === "short" && mins > 5) return false;
    if (duration === "medium" && (mins <= 5 || mins > 12)) return false;
    if (duration === "long" && mins <= 12) return false;
    if (q) {
      const haystack = `${m.title || ""} ${m.description || ""} ${cat}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const featured = suggested.find((m) => (m.category || "").toLowerCase() === "sono")
    || withAudio.find((m) => (m.category || "").toLowerCase() === "sono") || suggested[0] || withAudio[0];
  const imageFor = (m: MeditationTrack) => (m.category || "").toLowerCase() === "sono" ? restImage : presenceImage;
  const moments = [
    { category: "sono", label: "Quero descansar", icon: Moon },
    { category: "ansiedade", label: "Acalmar a mente", icon: Wind },
    { category: "foco", label: "Encontrar foco", icon: Focus },
  ].filter((moment) => allCategories.includes(moment.category));
  const card = (m: MeditationTrack) => <Button key={m.id} variant="ghost" className="h-auto w-full justify-start gap-3 whitespace-normal rounded-lg border border-border bg-card p-3 text-left" onClick={() => setSelected(m)} aria-label={`Ouvir ${m.title}`}>
    <img src={imageFor(m)} alt="" loading="lazy" width={1536} height={1024} className="h-16 w-16 shrink-0 rounded-md object-cover" />
    <span className="min-w-0 flex-1 space-y-1"><span className="block text-sm font-semibold leading-snug text-foreground">{m.title}</span><span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">{CATEGORY_LABELS[(m.category || "geral").toLowerCase()] || m.category} · {Math.round((m.duration_seconds || 0) / 60)} min{heardSet.has(m.id) && <span className="inline-flex items-center gap-1 text-primary"><CheckCircle2 className="h-3 w-3" /> já ouvi</span>}</span></span>
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary"><Play className="h-4 w-4" fill="currentColor" /></span>
  </Button>;

  return <section className="meditations-theme space-y-7">
    <div className="space-y-2"><p className="flex items-center gap-2 text-xs font-semibold text-primary"><Headphones className="h-4 w-4" /> Um momento para você</p><h2 className="font-display text-3xl leading-tight text-foreground">Respire. O resto pode esperar.</h2><p className="text-sm text-muted-foreground">Encontre uma pausa que combine com o seu momento.</p></div>
    {featured && <div className="meditation-feature relative isolate flex min-h-80 flex-col justify-end overflow-hidden rounded-lg p-5 sm:min-h-96 sm:p-7">
      <img src={imageFor(featured)} width={1536} height={1024} alt="Quarto tranquilo com jardim ao anoitecer" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div className="meditation-feature-shade absolute inset-0 -z-10" />
      <div className="meditation-feature-copy max-w-lg space-y-2"><p className="text-xs font-semibold">Sua pausa de hoje · {Math.round((featured.duration_seconds || 0) / 60)} min</p><h3 className="font-display text-2xl leading-tight sm:text-3xl">{featured.title}</h3>{featured.description && <p className="text-sm leading-relaxed">{featured.description}</p>}</div>
      <Button className="mt-4 w-fit max-w-full whitespace-normal" size="lg" onClick={() => setSelected(featured)}><Play fill="currentColor" /> Começar minha pausa</Button>
    </div>}
    <section aria-label="Escolha pelo momento" className="space-y-3"><h3 className="text-base font-semibold text-foreground">Como você quer se sentir?</h3><div className="flex flex-wrap gap-2">{moments.map((moment) => <Button key={moment.category} size="sm" variant={category === moment.category ? "default" : "outline"} aria-pressed={category === moment.category} onClick={() => { setCategory(category === moment.category ? "all" : moment.category); setQuery(""); setDuration("all"); }}><moment.icon />{moment.label}</Button>)}</div></section>
    {suggested.length > 0 && category === "all" && !query && duration === "all" && <section className="space-y-3" aria-label="Sugeridas pra você"><h3 className="flex items-center gap-2 text-base font-semibold text-foreground"><Sparkles className="h-4 w-4 text-primary" /> Sugeridas pra você</h3><div className="grid gap-2 sm:grid-cols-2">{suggested.filter((m) => m.id !== featured?.id).map(card)}</div></section>}
    <section className="space-y-4" aria-label="Biblioteca de meditações">
      <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold text-foreground">Sua biblioteca</h3><span className="text-xs text-muted-foreground">{filtered.length} práticas</span></div>
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar meditação" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar meditação..." className="bg-card pl-9" /></div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Categoria" className="min-w-0 bg-card text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas categorias</SelectItem>{allCategories.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c] || c}</SelectItem>)}</SelectContent></Select>
        <Select value={duration} onValueChange={setDuration}><SelectTrigger aria-label="Duração" className="min-w-0 bg-card text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Qualquer duração</SelectItem><SelectItem value="short">Até 5 min</SelectItem><SelectItem value="medium">5–12 min</SelectItem><SelectItem value="long">Mais de 12 min</SelectItem></SelectContent></Select>
      </div>
      {filtered.length ? <div className="grid gap-2 sm:grid-cols-2">{filtered.map(card)}</div> : <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma meditação corresponde aos filtros.</p>}
    </section>
    {selected && isActive && audioMap.get(selected.id) && <MeditationPlayer key={selected.id} track={selected} src={audioMap.get(selected.id)} image={imageFor(selected)} onClose={() => setSelected(null)} onPlay={() => recordAudioStarted(selected.id)} />}
  </section>;
}
