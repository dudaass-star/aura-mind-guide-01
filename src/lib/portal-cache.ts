const CACHE_VERSION = 1;

type CacheEnvelope<T> = {
  version: number;
  savedAt: number;
  value: T;
};

export function readPortalCache<T>(key: string, maxAgeMs: number): { value: T; savedAt: number } | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (parsed.version !== CACHE_VERSION || !parsed.savedAt || Date.now() - parsed.savedAt > maxAgeMs) {
      window.localStorage.removeItem(key);
      return null;
    }
    return { value: parsed.value, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function writePortalCache<T>(key: string, value: T) {
  try {
    const payload: CacheEnvelope<T> = { version: CACHE_VERSION, savedAt: Date.now(), value };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // O cache é apenas uma aceleração; falta de espaço não pode bloquear o aplicativo.
  }
}

export function removePortalCache(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nada a fazer quando o armazenamento local não está disponível.
  }
}