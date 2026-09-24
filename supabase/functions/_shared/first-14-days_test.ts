import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { actionFromNotificationType, chooseFirst14Direction, first14AgeDaysBrt, nextFirst14Cursor, type First14Signals } from "./first-14-days.ts";

const base: First14Signals = {
  ageDays: 0,
  hasConversation: false,
  hasJourney: false,
  hasSessionExperience: false,
  hasPractice: false,
  hasProgress: false,
  hasPendingEpisode: false,
  hasUpcomingSession: false,
};

Deno.test("prioriza a primeira conversa sem invadir o chat", () => {
  assertEquals(chooseFirst14Direction(base)?.milestone, "first_conversation");
});

Deno.test("não compete com sessão ou episódio pendente", () => {
  assertEquals(chooseFirst14Direction({ ...base, ageDays: 6, hasConversation: true, hasUpcomingSession: true }), null);
  assertEquals(chooseFirst14Direction({ ...base, ageDays: 6, hasConversation: true, hasPendingEpisode: true }), null);
});

Deno.test("apresenta valores progressivamente", () => {
  assertEquals(chooseFirst14Direction({ ...base, ageDays: 2, hasConversation: true })?.action, "journey");
  assertEquals(chooseFirst14Direction({ ...base, ageDays: 5, hasConversation: true, hasJourney: true })?.action, "session");
  assertEquals(chooseFirst14Direction({ ...base, ageDays: 8, hasConversation: true, hasJourney: true, hasSessionExperience: true })?.action, "practice");
  assertEquals(chooseFirst14Direction({ ...base, ageDays: 10, hasConversation: true, hasJourney: true })?.action, "progress");
});

Deno.test("conta dias pelo calendário de Brasília", () => {
  assertEquals(first14AgeDaysBrt("2026-09-23T23:50:00-03:00", new Date("2026-09-24T00:10:00-03:00")), 1);
  assertEquals(first14AgeDaysBrt("2026-09-24T00:10:00-03:00", new Date("2026-09-24T23:50:00-03:00")), 0);
});

Deno.test("encerra automaticamente depois do dia 14", () => {
  assertEquals(chooseFirst14Direction({ ...base, ageDays: 15 }), null);
});

Deno.test("reconhece somente avisos da condução inicial", () => {
  assertEquals(actionFromNotificationType("first14_session"), "session");
  assertEquals(actionFromNotificationType("journey_available"), null);
});

Deno.test("continua apenas quando o lote veio completo", () => {
  const fullBatch = Array.from({ length: 20 }, (_, index) => ({ user_id: `cliente-${String(index).padStart(2, "0")}` }));
  assertEquals(nextFirst14Cursor(fullBatch, 20), "cliente-19");
  assertEquals(nextFirst14Cursor(fullBatch.slice(0, 19), 20), null);
  assertEquals(nextFirst14Cursor([], 20), null);
});

Deno.test("dimensiona 50, 100, 200 e 300 clientes em lotes limitados", () => {
  for (const total of [50, 100, 200, 300]) {
    const batchSize = 20;
    const batchLengths = Array.from(
      { length: Math.ceil(total / batchSize) },
      (_, index) => Math.min(batchSize, total - index * batchSize),
    );
    assertEquals(batchLengths.reduce((sum, value) => sum + value, 0), total);
    assertEquals(batchLengths.every((value) => value > 0 && value <= batchSize), true);
    assertEquals(batchLengths.length, Math.ceil(total / batchSize));
  }
});