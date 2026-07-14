import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Headphones, Clock, Search, CheckCircle2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader, EmptyState, PortalLoadingInline } from "./shared";
import AudioPlayer from "./AudioPlayer";

interface MeditacoesTabProps {
  userId?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  ansiedade: "Ansiedade",
  sono: "Sono",
  foco: "Foco",
  estresse: "Estresse",
  autocompaixao: "Autocompaixão",
  geral: "Geral",
};

export function MeditacoesTab({ userId }: MeditacoesTabProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [duration, setDuration] = useState<string>("all");

  const { data: meditations, isLoading } = useQuery({
    queryKey: ["portal-all-meditations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meditations")
        .select("id, title, category, duration_seconds, description")
        .eq("is_active", true)
        .order("category");
      if (error) throw error;
      return data;
    },
  });

  const { data: audios } = useQuery({
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
        .order("sent_at", { ascending: false });
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

  if (isLoading) return <PortalLoadingInline />;

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

  const grouped = filtered.reduce((acc: Record<string, any[]>, m: any) => {
    const cat = m.category || "Geral";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <SectionHeader icon={Headphones} title="Meditações" />

      {suggested.length > 0 && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[#87A878]" />
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#1B2A4E] font-bold font-['Nunito']">
              Sugeridas pra você
            </p>
          </div>
          {suggested.map((m: any, idx: number) => (
            <MeditationCard
              key={`s-${m.id}`}
              meditation={m}
              audioUrl={audioMap.get(m.id)}
              heard={heardSet.has(m.id)}
              idx={idx}
            />
          ))}
        </div>
      )}

      <div className="space-y-2 animate-fade-in">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1B2A4E]/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar meditação..."
            className="pl-9 h-10 font-['Nunito'] text-sm bg-white/60 border-[#87A878]/20 text-[#1B2A4E]"
          />
        </div>
        <div className="flex gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 text-xs font-['Nunito'] flex-1 bg-white/60 border-[#87A878]/20 text-[#1B2A4E]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {allCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c] || c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="h-9 text-xs font-['Nunito'] flex-1 bg-white/60 border-[#87A878]/20 text-[#1B2A4E]">
              <SelectValue placeholder="Duração" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Qualquer duração</SelectItem>
              <SelectItem value="short">Até 5 min</SelectItem>
              <SelectItem value="medium">5–12 min</SelectItem>
              <SelectItem value="long">Mais de 12 min</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-[#2A2A2A]/60 font-['Nunito'] text-center py-6">
          Nenhuma meditação corresponde aos filtros.
        </p>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="space-y-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#87A878] font-bold font-['Nunito']">
            {CATEGORY_LABELS[cat.toLowerCase()] || cat}
          </p>
          {(items as any[]).map((meditation: any, idx: number) => (
            <MeditationCard
              key={meditation.id}
              meditation={meditation}
              audioUrl={audioMap.get(meditation.id)}
              heard={heardSet.has(meditation.id)}
              idx={idx}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function MeditationCard({
  meditation,
  audioUrl,
  heard,
  idx,
}: {
  meditation: any;
  audioUrl?: string;
  heard: boolean;
  idx: number;
}) {
  return (
    <div
      className="rounded-2xl border border-[#87A878]/15 bg-white/60 p-4 space-y-3 shadow-sm hover:shadow-md hover:border-[#87A878]/30 transition-all animate-fade-up"
      style={{ animationDelay: `${idx * 80}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="bg-[#B8A5D9]/25 rounded-full p-2.5 mt-0.5 shrink-0">
          <Headphones size={16} className="text-[#1B2A4E]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-['Fraunces'] text-lg font-semibold text-[#1B2A4E] leading-tight">
              {meditation.title}
            </p>
            {heard && (
              <span className="inline-flex items-center gap-1 text-[10px] font-['Nunito'] font-bold text-[#87A878] bg-[#87A878]/12 rounded-full px-2 py-0.5">
                <CheckCircle2 size={10} /> já ouvi
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Clock size={12} className="text-[#87A878]" />
            <p className="text-xs text-[#2A2A2A]/60 font-['Nunito'] font-semibold">
              {Math.round(meditation.duration_seconds / 60)} min
            </p>
          </div>
        </div>
      </div>
      {meditation.description && (
        <p className="text-sm text-[#2A2A2A]/80 font-['Nunito'] leading-relaxed">{meditation.description}</p>
      )}
      {audioUrl && <AudioPlayer src={audioUrl} />}
    </div>
  );
}