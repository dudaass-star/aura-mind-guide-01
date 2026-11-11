// @ts-ignore -- executado com bun test, fora do typecheck do app
import { describe, expect, test } from "bun:test";
import { isNightBrt, selectTodayHero, threadText } from "./today-hero";

// Converte horário de Brasília em ms UTC.
const brt = (iso: string) => new Date(`${iso}-03:00`).getTime();
const sess = (iso: string, status = "scheduled") => ({ id: "s1", scheduled_at: new Date(brt(iso)).toISOString(), status });
const thread = { id: "t1", scheduled_at: "", ended_at: new Date(brt("2026-11-09T20:00:00")).toISOString(), theme_label: "Trabalho", closure_text: "Você percebeu que queria se dar um tempo antes de responder aos pedidos no trabalho. Foi bom conversar." };
const base = { nextSession: null, lastSession: null, nightAudioAvailable: true, dismissedThreadId: null };

describe("aba Hoje", () => {
  test("22h com encontro amanhã às 19h: áudio no topo e encontro em linha secundária", () => {
    const h = selectTodayHero({ ...base, nowMs: brt("2026-11-10T22:00:00"), nextSession: sess("2026-11-11T19:00:00") });
    expect(h.kind).toBe("night");
    expect(h.kind === "night" && h.secondarySession?.id).toBe("s1");
  });
  test("22h com encontro às 22h30: encontro no topo e já com entrada liberada só a 15min", () => {
    const h = selectTodayHero({ ...base, nowMs: brt("2026-11-10T22:00:00"), nextSession: sess("2026-11-10T22:30:00") });
    expect(h.kind).toBe("session");
    expect(h.kind === "session" && h.canEnter).toBe(false);
    const h2 = selectTodayHero({ ...base, nowMs: brt("2026-11-10T22:15:00"), nextSession: sess("2026-11-10T22:30:00") });
    expect(h2.kind === "session" && h2.canEnter).toBe(true);
  });
  test("limite exato de 4h coloca o encontro no topo; 4h01 não", () => {
    expect(selectTodayHero({ ...base, nowMs: brt("2026-11-10T15:00:00"), nextSession: sess("2026-11-10T19:00:00") }).kind).toBe("session");
    expect(selectTodayHero({ ...base, nowMs: brt("2026-11-10T14:59:00"), nextSession: sess("2026-11-10T19:00:00") }).kind).toBe("prepare");
  });
  test("limite exato de 24h vira preparo mesmo com fio recente; 24h01 não", () => {
    expect(selectTodayHero({ ...base, nowMs: brt("2026-11-10T09:00:00"), nextSession: sess("2026-11-11T09:00:00"), lastSession: thread }).kind).toBe("prepare");
    expect(selectTodayHero({ ...base, nowMs: brt("2026-11-10T08:59:00"), nextSession: sess("2026-11-11T09:00:00"), lastSession: thread }).kind).toBe("thread");
  });
  test("sessão em andamento sempre no topo com entrada", () => {
    const h = selectTodayHero({ ...base, nowMs: brt("2026-11-10T23:00:00"), nextSession: sess("2026-11-10T22:30:00", "in_progress") });
    expect(h.kind === "session" && h.canEnter).toBe(true);
  });
  test("sessão cancelada ou concluída é ignorada", () => {
    expect(selectTodayHero({ ...base, nowMs: brt("2026-11-10T15:00:00"), nextSession: sess("2026-11-10T16:00:00", "cancelled") }).kind).toBe("routine");
  });
  test("janela noturna: 20h29 não, 20h30 sim, 23h59 e 00h00 sim, 05h59 sim, 06h00 não", () => {
    expect(isNightBrt(brt("2026-11-10T20:29:00"))).toBe(false);
    expect(isNightBrt(brt("2026-11-10T20:30:00"))).toBe(true);
    expect(isNightBrt(brt("2026-11-10T23:59:00"))).toBe(true);
    expect(isNightBrt(brt("2026-11-11T00:00:00"))).toBe(true);
    expect(isNightBrt(brt("2026-11-11T05:59:00"))).toBe(true);
    expect(isNightBrt(brt("2026-11-11T06:00:00"))).toBe(false);
  });
  test("sem áudio à noite segue para o próximo estado", () => {
    expect(selectTodayHero({ ...base, nightAudioAvailable: false, nowMs: brt("2026-11-10T22:00:00"), nextSession: sess("2026-11-11T19:00:00") }).kind).toBe("prepare");
  });
  test("fio vale até 48h e some quando dispensado", () => {
    expect(selectTodayHero({ ...base, nowMs: brt("2026-11-11T19:59:00"), lastSession: thread }).kind).toBe("thread");
    expect(selectTodayHero({ ...base, nowMs: brt("2026-11-11T20:00:00"), lastSession: thread }).kind).toBe("routine");
    expect(selectTodayHero({ ...base, nowMs: brt("2026-11-10T10:00:00"), lastSession: thread, dismissedThreadId: "t1" }).kind).toBe("routine");
  });
  test("despedida genérica não vira fio", () => {
    expect(threadText("Foi bom conversar com você hoje. Até a próxima!")).toBeNull();
    expect(threadText(thread.closure_text)).toBe("Você percebeu que queria se dar um tempo antes de responder aos pedidos no trabalho.");
  });
});

import { homeBarFromHero } from "./today-hero";
describe("barra da tela inicial", () => {
  const s = { id: "s1", scheduled_at: "2026-11-11T22:00:00.000Z", status: "scheduled" };
  test("preparo a mais de 4h fica oculto", () => { expect(homeBarFromHero({ kind: "prepare", session: s })).toBeNull(); });
  test("rotina fica oculta, mesmo com encontro secundário", () => { expect(homeBarFromHero({ kind: "routine", secondarySession: s })).toBeNull(); });
  test("encontro próximo aparece com acesso", () => { expect(homeBarFromHero({ kind: "session", session: s, canEnter: true })).toEqual({ kind: "session", session: s, canEnter: true }); });
  test("noite e fio aparecem", () => {
    expect(homeBarFromHero({ kind: "night", secondarySession: s })).toEqual({ kind: "night" });
    expect(homeBarFromHero({ kind: "thread", session: { id: "l1", scheduled_at: s.scheduled_at }, text: "x" })).toEqual({ kind: "thread", sessionId: "l1" });
  });
});

import { takeawayFromClosure as takeaway } from "./today-hero";
describe("Para você levar", () => {
  test("pula fechamento que é só despedida", () => {
    expect(takeaway("Foi muito bom conversar com você. Cuide-se, até a próxima!")).toBeNull();
  });
  test("mostra decisão concreta da sessão", () => {
    expect(takeaway("Você decidiu dizer não ao pedido do seu irmão antes de sexta.")).toContain("dizer não");
  });
});

import { homeBarWithSaved } from "./today-hero";
describe("Frase guardada na tela inicial", () => {
  const now = Date.parse("2026-11-11T18:00:00Z");
  const saved = { id: "m1", created_at: "2026-11-11T10:00:00Z" };
  test("aparece quando a barra está livre", () => {
    expect(homeBarWithSaved(null, saved, now)).toEqual({ kind: "saved", itemId: "m1" });
  });
  test("fio para retomar mantém a prioridade", () => {
    expect(homeBarWithSaved({ kind: "thread", sessionId: "s1" }, saved, now)).toEqual({ kind: "thread", sessionId: "s1" });
  });
  test("some depois de 48h", () => {
    expect(homeBarWithSaved(null, { id: "m1", created_at: "2026-11-09T17:00:00Z" }, now)).toBeNull();
  });
});
