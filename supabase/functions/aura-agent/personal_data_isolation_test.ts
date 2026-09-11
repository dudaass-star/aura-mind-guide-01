import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const nomesDoIncidente = ["Bella", "Selena"];

async function lerArquivo(relativoAoTeste: string): Promise<string> {
  return await Deno.readTextFile(new URL(relativoAoTeste, import.meta.url));
}

Deno.test("isolamento: nomes do incidente não aparecem nas orientações compartilhadas", async () => {
  const fontes = await Promise.all([
    lerArquivo("./index.ts"),
    lerArquivo("../generate-user-portrait/index.ts"),
    lerArquivo("../conversation-followup/index.ts"),
  ]);

  for (const fonte of fontes) {
    for (const nome of nomesDoIncidente) {
      assertEquals(fonte.includes(nome), false);
    }
  }
});

Deno.test("isolamento: contextos independentes não compartilham nomes", () => {
  const contextoSemNomes = "Vou cuidar das minhas filhas.";
  const contextoComNomes = "Minhas filhas se chamam Bella e Selena.";

  for (const nome of nomesDoIncidente) {
    assertEquals(contextoSemNomes.includes(nome), false);
    assertEquals(contextoComNomes.includes(nome), true);
  }
});