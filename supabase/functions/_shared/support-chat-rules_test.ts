import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deterministicHandoff, MAX_USER_TURNS } from "./support-chat-rules.ts";

Deno.test("pedido explícito de humano deriva", () => assertEquals(deterministicHandoff(["quero falar com um atendente"]), "pedido_humano"));
Deno.test("reembolso deriva para equipe", () => assertEquals(deterministicHandoff(["quero reembolso"]), "tema_sensivel"));
Deno.test("dúvida comum fica com o agente", () => assertEquals(deterministicHandoff(["como remarco meu encontro?"]), null));
Deno.test("quarta mensagem ainda é respondida", () => assertEquals(deterministicHandoff(Array(MAX_USER_TURNS).fill("oi")), null));
Deno.test("quinta mensagem passa para humano", () => assertEquals(deterministicHandoff(Array(MAX_USER_TURNS + 1).fill("oi")), "limite_turnos"));
