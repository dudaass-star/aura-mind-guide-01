import { useEffect, useState } from "react";
import { Moon, Play, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPrayerHighlight } from "@/lib/prayers";

// Cadência: dispensar no X silencia por 3 dias.
const DAY = 86400000;
const keyFor = (userId?: string) => `ola_aura_prayer_card:${userId || "anon"}`;
type State = { shownAt?: number; dismissedAt?: number };
const read = (userId?: string): State => { try { return JSON.parse(localStorage.getItem(keyFor(userId)) || "{}"); } catch { return {}; } };
const write = (userId: string | undefined, s: State) => { try { localStorage.setItem(keyFor(userId), JSON.stringify({ ...read(userId), ...s })); } catch { /* sem armazenamento */ } };

// Janelas em Brasília: manhã 06h00–09h30 e noite 20h30–23h59; fora delas a barra não aparece.
export function prayerWindow(now = new Date()): "morning" | "night" | null {
  const brt = new Date(now.getTime() - 3 * 3600000);
  const minutes = brt.getUTCHours() * 60 + brt.getUTCMinutes();
  if (minutes >= 360 && minutes < 570) return "morning";
  if (minutes >= 1230) return "night";
  return null;
}

export function PrayerEntranceCard({ userId, onOpen, onEvent }: { userId?: string; onOpen: () => void; onEvent?: (event: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [window] = useState(() => prayerWindow());
  const [highlight] = useState(() => getPrayerHighlight());

  useEffect(() => {
    if (!window) return;
    const s = read(userId);
    const now = Date.now();
    if (s.dismissedAt && now - s.dismissedAt < 3 * DAY) return;
    setVisible(true);
    // Conta no máximo uma exibição a cada 12h para não inflar a métrica.
    if (!s.shownAt || now - s.shownAt >= DAY / 2) { write(userId, { shownAt: now }); onEvent?.("prayer_card_viewed"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!visible || !window || !highlight.prayer) return null;
  const prayer = highlight.prayer;
  const Icon = window === "morning" ? Sun : Moon;
  const minutes = Math.max(1, Math.round(prayer.duration / 60));

  return (
    <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-border bg-card py-1.5 pl-2 pr-1 shadow-sm">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true"><Icon className="h-4 w-4" /></span>
      <button type="button" onClick={() => { onEvent?.("prayer_card_clicked"); onOpen(); }} className="min-w-0 flex-1 text-left" aria-label={`Ouvir oração: ${prayer.title}`}>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{window === "morning" ? "Para começar o dia" : "Para esta noite"} · {minutes} min</span>
        <span className="block truncate text-sm font-medium text-foreground">{prayer.title}</span>
      </button>
      <Button type="button" size="sm" onClick={() => { onEvent?.("prayer_card_clicked"); onOpen(); }} className="h-8 shrink-0 gap-1.5 rounded-full px-3">
        <Play className="h-3 w-3" fill="currentColor" /> Ouvir
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={() => { write(userId, { dismissedAt: Date.now() }); setVisible(false); onEvent?.("prayer_card_dismissed"); }} className="h-8 w-8 shrink-0 text-muted-foreground" aria-label="Ocultar sugestão de oração">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
