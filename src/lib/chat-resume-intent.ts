// Intenção temporária de retomar um fio (aba Hoje → Conversar).
// Nunca vira texto no campo: só a referência da sessão viaja no 1º envio.
const key = (userId: string) => `aura-chat-intent:${userId}`;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

const notify = () => { try { window.dispatchEvent(new Event("aura:resume-intent")); } catch { /* sem janela */ } };

export function setResumeIntent(userId: string, sessionId: string, label?: string) {
  try { sessionStorage.setItem(key(userId), JSON.stringify({ sessionId, label: label?.trim().slice(0, 160) || undefined, at: Date.now() })); } catch { /* sem storage */ }
  notify();
}

/** Texto curto do fio para o aviso no topo da conversa. */
export function readResumeLabel(userId: string): string | null {
  if (!readResumeIntent(userId)) return null;
  try { return (JSON.parse(sessionStorage.getItem(key(userId)) || "{}") as { label?: string }).label || ""; } catch { return ""; }
}

export function readResumeIntent(userId: string): string | undefined {
  try {
    const raw = sessionStorage.getItem(key(userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { sessionId?: string; at?: number };
    if (!parsed.sessionId || !parsed.at || Date.now() - parsed.at > MAX_AGE_MS) {
      sessionStorage.removeItem(key(userId));
      return undefined;
    }
    return parsed.sessionId;
  } catch { return undefined; }
}

export function clearResumeIntent(userId: string) {
  try { sessionStorage.removeItem(key(userId)); } catch { /* sem storage */ }
  notify();
}

/** Consome só se a intenção ainda é a mesma que foi enviada com sucesso. */
export function consumeResumeIntent(userId: string, sessionId: string) {
  if (readResumeIntent(userId) === sessionId) clearResumeIntent(userId);
}
