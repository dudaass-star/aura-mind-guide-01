import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chooseTodayDirection, type TodaySignals } from "./today-direction.ts";

const base: TodaySignals = {
  nowMs: new Date("2026-09-24T14:00:00Z").getTime(), accountStartAt: "2026-09-01T12:00:00Z",
  hasConversation: true, hasJourneyExperience: false, hasSessionExperience: false,
  hasPracticeExperience: false, hasProgressExperience: false, nextSession: null,
  pendingEpisode: null, lastSession: null,
};

Deno.test("prioriza sessão iminente acima das demais direções", () => {
  const result = chooseTodayDirection({ ...base, pendingEpisode: { id: "e", episode_number: 1 }, nextSession: { id: "s", status: "scheduled", scheduled_at: "2026-09-24T14:10:00Z" } });
  assertEquals(result.direction.reason, "session_imminent");
});

Deno.test("preparação só domina dentro de 48 horas", () => {
  const near = chooseTodayDirection({ ...base, nextSession: { id: "s", status: "scheduled", scheduled_at: "2026-09-26T13:00:00Z" } });
  assertEquals(near.direction.reason, "session_prepare_48h");
  const distant = chooseTodayDirection({ ...base, nextSession: { id: "s", status: "scheduled", scheduled_at: "2026-09-28T14:00:00Z" } });
  assertEquals(distant.direction.reason, "open_conversation");
  assertEquals(distant.continuation?.reason, "upcoming_session");
});

Deno.test("recomenda somente episódio explicitamente pendente", () => {
  assertEquals(chooseTodayDirection(base).direction.reason, "open_conversation");
  assertEquals(chooseTodayDirection({ ...base, pendingEpisode: { id: "e", episode_number: 2, title: "Continuar" } }).direction.reason, "pending_episode");
});

Deno.test("não insiste em descoberta ignorada três vezes", () => {
  const result = chooseTodayDirection({ ...base, accountStartAt: "2026-09-22T12:00:00Z", ignoredActions: ["journey"] });
  assertEquals(result.direction.reason, "open_conversation");
});