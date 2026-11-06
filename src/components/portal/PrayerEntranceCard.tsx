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

// Janelas em Brasília: manhã 06h00–09h30, tarde 12h00–18h00 e noite 20h30–23h59; fora delas a barra não aparece.
export function prayerWindow(now = new Date()): "morning" | "afternoon" | "night" | null {
  const brt = new Date(now.getTime() - 3 * 3600000);
  const minutes = brt.getUTCHours() * 60 + brt.getUTCMinutes();
  if (minutes >= 360 && minutes < 570) return "morning";
  if (minutes >= 720 && minutes < 1080) return "afternoon";
  if (minutes >= 1230) return "night";
  return null;
}

export function PrayerEntranceCard({ userId, onOpen, onEvent }: { userId?: string; onOpen: () => void; onEvent?: (event: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [slot] = useState(() => prayerWindow());
  const [highlight] = useState(() => getPrayerHighlight());

  useEffect(() => {
    if (!slot) return;
    const s = read(userId);
    const now = Date.now();
    if (s.dismissedAt && now - s.dismissedAt < 3 * DAY) return;
    setVisible(true);
    // Conta no máximo uma exibição a cada 12h para não inflar a métrica.
    if (!s.shownAt || now - s.shownAt >= DAY / 2) { write(userId, { shownAt: now }); onEvent?.("prayer_card_viewed"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!visible || !slot || !highlight.prayer) return null;
  const prayer = highlight.prayer;
  const Icon = slot === "night" ? Moon : Sun;
  const minutes = Math.max(1, Math.round(prayer.duration / 60));

  return (
    <section className="border-t border-border pt-4 animate-fade-up">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => { onEvent?.("prayer_card_clicked"); onOpen(); }} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left" aria-label={`Ouvir oração: ${prayer.title}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary" aria-hidden="true"><Icon className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-muted-foreground">Oração {slot === "morning" ? "para começar o dia" : slot === "afternoon" ? "para renovar as forças" : "para esta noite"} · {minutes} min</span>
            <span className="mt-0.5 block text-sm font-semibold leading-snug text-foreground">{prayer.title}</span>
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true"><Play className="h-3.5 w-3.5" fill="currentColor" /></span>
        </button>
        <Button type="button" variant="ghost" size="icon" onClick={() => { write(userId, { dismissedAt: Date.now() }); setVisible(false); onEvent?.("prayer_card_dismissed"); }} className="h-8 w-8 shrink-0 text-muted-foreground" aria-label="Ocultar sugestão de oração">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
