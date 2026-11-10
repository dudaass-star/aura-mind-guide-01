// @ts-ignore -- executado com bun test, fora do typecheck do app
import { beforeEach, expect, test } from "bun:test";
const store = new Map<string, string>();
(globalThis as any).sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
const m = await import("./chat-resume-intent");
beforeEach(() => store.clear());
test("intenção fica disponível até ser consumida", () => { m.setResumeIntent("u", "s1"); expect(m.readResumeIntent("u")).toBe("s1"); m.consumeResumeIntent("u", "s1"); expect(m.readResumeIntent("u")).toBeUndefined(); });
test("falha no envio preserva a intenção (não consome)", () => { m.setResumeIntent("u", "s1"); expect(m.readResumeIntent("u")).toBe("s1"); });
test("consumo de outra sessão não apaga a intenção atual", () => { m.setResumeIntent("u", "s2"); m.consumeResumeIntent("u", "s1"); expect(m.readResumeIntent("u")).toBe("s2"); });
test("sair do fluxo descarta", () => { m.setResumeIntent("u", "s1"); m.clearResumeIntent("u"); expect(m.readResumeIntent("u")).toBeUndefined(); });
