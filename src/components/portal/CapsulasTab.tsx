import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Heart, Mail } from "lucide-react";
import { SectionHeader, EmptyState, PortalLoadingInline } from "./shared";
import AudioPlayer from "./AudioPlayer";

export function CapsulasTab({ userId }: { userId: string }) {
  const { data: capsules, isLoading } = useQuery({
    queryKey: ["portal-capsules", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_capsules")
        .select("*")
        .eq("user_id", userId)
        .eq("delivered", true)
        .order("delivered_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  if (isLoading) return <PortalLoadingInline />;

  if (!capsules || capsules.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="Nenhuma cápsula ainda"
        description="Grave uma cápsula do tempo com a Aura e ela aparecerá aqui quando chegar a hora!"
      />
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader icon={Heart} title="Cápsulas do Tempo" />
      {capsules.map((capsule: any, idx: number) => {
        const deliveredDate = capsule.delivered_at
          ? new Date(capsule.delivered_at).toLocaleDateString("pt-BR")
          : "";
        const createdDate = new Date(capsule.created_at).toLocaleDateString("pt-BR");

        return (
          <div
            key={capsule.id}
            className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-sm hover:shadow-card transition-all animate-fade-up"
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-['Fraunces'] font-semibold text-foreground">Cápsula de {createdDate}</p>
                <p className="text-xs text-muted-foreground font-['Nunito']">Entregue em {deliveredDate}</p>
              </div>
              <div className="bg-accent/10 rounded-full p-2">
                <Mail size={18} className="text-accent" />
              </div>
            </div>

            {capsule.context_message && (
              <p className="text-sm text-foreground/80 font-['Nunito'] italic border-l-2 border-accent/30 pl-3">
                "{capsule.context_message}"
              </p>
            )}

            {capsule.audio_url && <AudioPlayer src={capsule.audio_url} type="audio/ogg" />}

            {capsule.transcription && (
              <details className="text-sm">
                <summary className="text-accent font-['Nunito'] cursor-pointer font-medium hover:text-accent/80 transition-colors">
                  Ver transcrição
                </summary>
                <p className="mt-2 text-foreground/80 font-['Nunito'] leading-relaxed animate-fade-in">
                  {capsule.transcription}
                </p>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
