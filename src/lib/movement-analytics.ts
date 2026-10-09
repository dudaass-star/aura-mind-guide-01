import { useEffect, useRef } from "react";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { getMovementVisitorKey } from "@/lib/movement";

type Surface = "app" | "public" | "area";
const recent = new Map<string, number>();
function sessionKey() {
  const key = "ola-aura-movement-session";
  let value = sessionStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); sessionStorage.setItem(key, value); }
  return value;
}

// A repetição usa o mesmo identificador; não grava texto pessoal nem conteúdo do convite.
export function trackMovement(event: string, surface: Surface, metadata: Record<string, string> = {}) {
  try {
    const key = `${surface}:${event}:${JSON.stringify(metadata)}`;
    const now = Date.now();
    if (now - (recent.get(key) || 0) < 1000) return;
    recent.set(key, now);
    const args = { _id: crypto.randomUUID(), _visitor_id: getMovementVisitorKey(), _session_id: sessionKey(), _event_type: event, _surface: surface, _metadata: metadata };
    const send = async () => {
      const { error } = await supabasePortal.rpc("record_movement_usage", args);
      if (error) console.warn("Não foi possível registrar o uso do Movimento", error.code);
      return error;
    };
    void send().then(error => {
      if (error && (!error.code || error.code.startsWith("5"))) window.setTimeout(() => void send(), 1500);
    });
  } catch { console.warn("Medição do Movimento indisponível neste navegador"); }
}

// Só mede elementos visíveis por ao menos 500 ms, nunca abas ocultas ou pré-carregadas.
export function useMovementVisibility(surface: Surface, active = true, pageEvent?: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const seen = new Set<string>();
    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const events = [element === root ? pageEvent : undefined, element.dataset.movementEvent].filter((event): event is string => Boolean(event));
        if (events.every(event => seen.has(event))) continue;
        const old = timers.get(element);
        if (old) { clearTimeout(old); timers.delete(element); }
        if (entry.isIntersecting && document.visibilityState === "visible") {
          timers.set(element, setTimeout(() => {
            if (document.visibilityState !== "visible" || !element.getClientRects().length) return;
            for (const event of events) {
              if (seen.has(event)) continue;
              seen.add(event);
              trackMovement(event, surface);
            }
          }, 500));
        }
      }
    }, { threshold: 0.05 });
    const observe = () => { observer.observe(root); root.querySelectorAll("[data-movement-event]").forEach(el => observer.observe(el)); };
    observe();
    const mutation = new MutationObserver(observe);
    mutation.observe(root, { childList: true, subtree: true });
    const visibility = () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      observer.disconnect();
      if (document.visibilityState === "visible") observe();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => { observer.disconnect(); mutation.disconnect(); timers.forEach(clearTimeout); document.removeEventListener("visibilitychange", visibility); };
  }, [surface, active, pageEvent]);
  return ref;
}