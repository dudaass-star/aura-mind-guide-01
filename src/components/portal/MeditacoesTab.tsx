import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Headphones, Clock } from "lucide-react";
import { SectionHeader, EmptyState, PortalLoadingInline } from "./shared";
import AudioPlayer from "./AudioPlayer";

export function MeditacoesTab() {
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

  if (isLoading) return <PortalLoadingInline />;

  const audioMap = new Map(audios?.map((a: any) => [a.meditation_id, a.public_url]) || []);
  const withAudio = meditations?.filter((m: any) => audioMap.has(m.id)) || [];

  if (withAudio.length === 0) {
    return (
      <EmptyState
        icon={Headphones}
        title="Nenhuma meditação disponível"
        description="As meditações estarão disponíveis em breve!"
      />
    );
  }

  const grouped = withAudio.reduce((acc: Record<string, any[]>, m: any) => {
    const cat = m.category || "Geral";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    ansiedade: "Ansiedade",
    sono: "Sono",
    foco: "Foco",
    estresse: "Estresse",
    autocompaixao: "Autocompaixão",
    geral: "Geral",
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={Headphones} title="Meditações" />
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="space-y-3">
          <p className="text-sm font-semibold text-foreground font-['Nunito'] capitalize">
            {categoryLabels[category.toLowerCase()] || category}
          </p>
          {(items as any[]).map((meditation: any, idx: number) => {
            const audioUrl = audioMap.get(meditation.id);
            return (
              <div
                key={meditation.id}
                className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm hover:shadow-card transition-all animate-fade-up"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div className="bg-accent/10 rounded-full p-2 mt-0.5 shrink-0">
                    <Headphones size={16} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-['Fraunces'] font-semibold text-foreground">{meditation.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock size={12} className="text-muted-foreground" />
                      <p className="text-xs text-muted-foreground font-['Nunito']">
                        {Math.round(meditation.duration_seconds / 60)} min
                      </p>
                    </div>
                  </div>
                </div>
                {meditation.description && (
                  <p className="text-sm text-foreground/80 font-['Nunito']">{meditation.description}</p>
                )}
                {audioUrl && <AudioPlayer src={audioUrl} />}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
