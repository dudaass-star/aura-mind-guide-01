import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyFeedback, normalize } from "./index.ts";

Deno.test("normalize descarta notas episódicas e mantém relações estáveis", () => {
  const portrait = normalize({ pessoas: [
    { label: "Parceira", names: ["Ana"], nota: "ficou brava hoje" },
    { label: "Irmão", names: ["João"], nota: "apoio constante em decisões difíceis" },
  ] });
  assertEquals(portrait.pessoas[0].nota, null);
  assertEquals(portrait.pessoas[1].nota, "apoio constante em decisões difíceis");
});

Deno.test("feedback removido bloqueia reaparecimento com variação textual próxima", () => {
  const portrait = normalize({ padroes: ["Parece que você costuma evitar conversas difíceis."] });
  const filtered = applyFeedback(portrait, [{
    section: "padroes",
    original_text: "Talvez você costume evitar conversas difíceis",
    status: "removed",
    corrected_text: null,
  }]);
  assertEquals(filtered.padroes, []);
});

Deno.test("correção do usuário prevalece deterministicamente", () => {
  const portrait = normalize({ preferencias: ["Você gosta de conversar pela manhã."] });
  const corrected = applyFeedback(portrait, [{
    section: "preferencias",
    original_text: "Você gosta de conversar pela manhã.",
    status: "corrected",
    corrected_text: "Prefiro conversar no fim da tarde.",
  }]);
  assertEquals(corrected.preferencias, ["Prefiro conversar no fim da tarde."]);
});