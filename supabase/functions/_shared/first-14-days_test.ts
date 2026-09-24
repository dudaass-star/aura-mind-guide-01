import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chooseFirst14Direction, type First14Signals } from "./first-14-days.ts";

const base: First14Signals = {
  ageDays: 0,
  hasConversation: false,
  hasJourney: false,
  hasCompletedSession: false,
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
  assertEquals(chooseFirst14Direction({ ...base, ageDays: 8, hasConversation: true, hasJourney: true, hasCompletedSession: true })?.action, "practice");
  assertEquals(chooseFirst14Direction({ ...base, ageDays: 10, hasConversation: true, hasJourney: true })?.action, "progress");
});

Deno.test("encerra automaticamente depois do dia 14", () => {
  assertEquals(chooseFirst14Direction({ ...base, ageDays: 15 }), null);
});