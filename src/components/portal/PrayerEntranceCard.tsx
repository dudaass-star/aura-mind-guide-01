import { useEffect, useState } from "react";
import { Moon, Play, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPrayerHighlight } from "@/lib/prayers";

// Cadência: no máximo 1 exibição por dia; dispensar no X silencia por 3 dias.
const DAY = 86400000;
const keyFor = (userId?: string) => `ola_aura_prayer_card:${userId || "anon"}`;
type State = { shownAt?: number; dismissedAt?: number };
const read = (userId?: string): State => { try { return JSON.parse(localStorage.getItem(keyFor(userId)) || "{}"); } catch { return {}; } };
const write = (userId: string | undefined, s: State) => { try { localStorage.setItem(keyFor(userId), JSON.stringify({ ...read(userId), ...s })); } catch { /* sem armazenamento */ } };

export function PrayerEntranceCard({ userId, onOpen, onEvent }: { userId?: string; onOpen: () => void; onEvent?: (event: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [highlight] = useState(() => getPrayerHighlight());

  useEffect(() => {
    const s = read(userId);
    const now = Date.now();
    if (s.dismissedAt && now - s.dismissedAt < 3 * DAY) return;
    // Na mesma janela de 24h, mantém visível para quem volta ao início.
    if (s.shownAt && now - s.shownAt < DAY) { setVisible(true); return; }
    write(userId, { shownAt: now });
    setVisible(true);
    onEvent?.("prayer_card_viewed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!visible || !highlight.prayer) return null;
  const prayer = highlight.prayer;
  const Icon = highlight.label === "Para começar o dia com Deus" ? Sun : Moon;
  const minutes = Math.max(1, Math.round(prayer.duration / 60));

  return (
    <div className="relative isolate mb-3 overflow-hidden rounded-lg border border-border shadow-sm">
      <img src={prayer.image} alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-foreground/85 via-foreground/65 to-foreground/30" aria-hidden="true" />
      <Button type="button" variant="ghost" size="icon" onClick={() => { write(userId, { dismissedAt: Date.now() }); setVisible(false); onEvent?.("prayer_card_dismissed"); }} className="absolute right-1.5 top-1.5 h-9 w-9 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground" aria-label="Ocultar sugestão de oração">
        <X className="h-4 w-4" />
      </Button>
      <div className="px-4 pb-4 pt-3.5 pr-11 text-primary-foreground">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-foreground/80"><Icon className="h-3.5 w-3.5" />{highlight.label}</p>
        <h3 className="mt-2 font-display text-lg font-medium leading-snug">{prayer.title}</h3>
        <p className="mt-1 text-xs text-primary-foreground/75">Oração guiada com a Aura · {minutes} min</p>
        <Button type="button" size="sm" variant="secondary" onClick={() => { onEvent?.("prayer_card_clicked"); onOpen(); }} className="mt-3 gap-2 rounded-full px-4">
          <Play className="h-3.5 w-3.5" fill="currentColor" /> Ouvir oração agora
        </Button>
      </div>
    </div>
  );
}
