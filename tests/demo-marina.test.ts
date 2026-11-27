import { expect, test } from "bun:test";
import fixture from "./fixtures/demo-marina.json";
import { isFreshlySealed, percursoMonthKey } from "../src/lib/percurso-story";

// Referência estrutural da conta fictícia, conferida no App em 27/11/2026.
// Não contém sessões de clientes, credenciais, links privados ou testes de texto/visual.
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const brtMonth = (iso: string) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
}).format(new Date(iso));
const messages = new Map(fixture.messages.map((message) => [message.id, message]));
const completed = fixture.sessions.filter((session) => session.status === "completed");

test("referência isolada na personagem demo, sem telefone de cliente", () => {
  expect(fixture.profile.status).toBe("demo");
  expect(fixture.profile.phone).toBeNull();
  expect(fixture.messages.length).toBe(138);
  for (const row of [...fixture.messages, ...fixture.sessions]) {
    expect(row.user_id).toBe(fixture.profile.user_id);
  }
  for (const row of fixture.messages) {
    expect(row.metadata.demo).toBe(true);
    expect(row.metadata.fictional).toBe(true);
  }
});

test("toda resposta tem mensagem anterior da Marina, com referência canônica", () => {
  for (const message of fixture.messages.filter((item) => item.role === "assistant")) {
    const replyId = message.metadata.reply_to_message_id;
    expect(typeof replyId).toBe("string");
    if (!replyId) throw new Error("Resposta sem mensagem da personagem");
    expect(replyId).toMatch(uuid);
    const previous = messages.get(replyId);
    expect(previous?.role).toBe("user");
    if (!previous) throw new Error("Mensagem de origem ausente");
    expect(Date.parse(previous.created_at)).toBeLessThan(Date.parse(message.created_at));
    expect(previous.metadata.session_id).toBe(message.metadata.session_id);
  }
});

test("seis encontros de 45 minutos começam com participação e terminam com resposta", () => {
  expect(completed.length).toBe(6);
  for (const session of completed) {
    const history = fixture.messages.filter((row) => row.metadata.session_id === session.id);
    expect(history[0]?.role).toBe("user");
    expect(history.at(-1)?.role).toBe("assistant");
    expect(history.filter((row) => row.role === "user").length).toBeGreaterThanOrEqual(7);
    expect(session.duration_minutes).toBe(45);
    if (!session.started_at || !session.ended_at) throw new Error("Encontro sem início/fim");
    expect(Date.parse(session.ended_at) - Date.parse(session.started_at)).toBe(45 * 60_000);
    expect(history[0]?.created_at).toBe(session.started_at);
    expect(history.at(-1)?.created_at).toBe(session.ended_at);
    expect(["tese", "pergunta-pra-carregar"]).toContain(session.closure_type);
  }
});

test("o Essencial demonstrativo respeita dois encontros por mês", () => {
  expect(fixture.profile.plan).toBe("essencial");
  const months = new Map<string, number>();
  for (const session of fixture.sessions) {
    const month = brtMonth(session.scheduled_at);
    months.set(month, (months.get(month) || 0) + 1);
  }
  expect([...months.values()].sort()).toEqual([1, 2, 2, 2]);
  expect(fixture.sessions.filter((row) => row.status === "scheduled").length).toBe(1);
});

test("a paginação por sequência mantém a ordem cronológica", () => {
  const ids = fixture.messages.map((row) => row.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (let i = 1; i < fixture.messages.length; i++) {
    expect(Date.parse(fixture.messages[i].created_at)).toBeGreaterThanOrEqual(Date.parse(fixture.messages[i - 1].created_at));
  }
});

test("três reflexões guardadas pertencem a encontros distintos e concluídos", () => {
  expect(fixture.saved.length).toBe(3);
  expect(new Set(fixture.saved.map((row) => row.session_id)).size).toBe(3);
  for (const saved of fixture.saved) {
    const session = completed.find((row) => row.id === saved.session_id);
    expect(session).toBeDefined();
    expect(saved.date).toBe(session?.ended_at);
  }
});

test("as seis leituras de evolução têm evidência da personagem dentro do período", () => {
  expect(fixture.snapshots.length).toBe(6);
  const dates: number[] = [];
  for (const snapshot of fixture.snapshots) {
    const evidence = messages.get(snapshot.evidence_id);
    expect(evidence?.role).toBe("user");
    expect(evidence?.created_at).toBe(snapshot.evidence_date);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(snapshot.evidence_date));
    expect(day >= snapshot.start && day <= snapshot.end).toBe(true);
    dates.push(Date.parse(snapshot.evidence_date));
  }
  expect(Math.max(...dates) - Math.min(...dates)).toBeGreaterThan(20 * 86_400_000);
});

test("quatro vozes têm arquivo preparado e duração real antes do primeiro toque", () => {
  const audios = fixture.messages.filter((message) => message.is_audio);
  expect(audios.length).toBe(4);
  for (const message of audios) {
    expect(message.role).toBe("assistant");
    expect(message.audio_ready).toBe(true);
    expect(message.duration_ms).toBeGreaterThan(3000);
  }
});

test("Percurso tem dois capítulos fechados, três leituras semanais e quatro viradas", () => {
  expect(fixture.letters).toEqual(["2026-09-01", "2026-10-01"]);
  expect(fixture.counts).toEqual({ themes: 3, milestones: 4, weekly_reports: 3, monthly_reports: 2 });
});

test("primeiro dia das cartas não cria capítulo no mês anterior em Brasília", () => {
  expect(fixture.letters.map(percursoMonthKey)).toEqual(["2026-09", "2026-10"]);
  expect(percursoMonthKey("2026-11-01T01:00:00Z")).toBe("2026-10");
  expect(isFreshlySealed("2026-10-01", new Date("2026-11-05T15:00:00Z"))).toBe(true);
  expect(isFreshlySealed("2026-10-01", new Date("2026-11-08T15:00:00Z"))).toBe(false);
});