// @ts-ignore -- executado com bun test, fora do typecheck do app
import { describe, it, expect } from "bun:test";
import { isWhatsAppOnlyNotice } from "./whatsapp-only-notice";

describe("avisos só do WhatsApp", () => {
  it("esconde o convite de migração ao App", () => {
    expect(isWhatsAppOnlyNotice({ role: "assistant", metadata: { kind: "app_migration_redirect" } })).toBe(true);
  });
  it("mantém respostas normais da Aura", () => {
    expect(isWhatsAppOnlyNotice({ role: "assistant", metadata: {} })).toBe(false);
  });
  it("mantém falas do cliente vindas do WhatsApp", () => {
    expect(isWhatsAppOnlyNotice({ role: "user", metadata: { kind: "app_migration_redirect" } })).toBe(false);
  });
});
