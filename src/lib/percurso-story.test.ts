// @ts-ignore -- executado com bun test, fora do typecheck do app
import { describe, it, expect } from "bun:test";
import { pickEvolution, isFreshlySealed } from "./percurso-story";

const s = (id: string, date: string, before: string | null, change: string | null) => ({ id, snapshot_before: before, snapshot_change: change, evidence_date: date, period_end: null });

describe("pickEvolution", () => {
  it("usa o antes mais antigo e o agora mais recente", () => {
    const r = pickEvolution([s("b", "2026-10-20", null, "agora eu coloco limite"), s("a", "2026-06-01", "medo da cobrança", null)]);
    expect(r?.beforeText).toBe("medo da cobrança");
    expect(r?.nowText).toBe("agora eu coloco limite");
  });
  it("não mostra evolução com menos de 20 dias", () => {
    expect(pickEvolution([s("a", "2026-10-01", "x", null), s("b", "2026-10-10", null, "y")])).toBeNull();
  });
});

describe("isFreshlySealed", () => {
  it("anuncia o mês anterior até o dia 7", () => {
    expect(isFreshlySealed("2026-10-15T12:00:00", new Date(2026, 10, 7))).toBe(true);
    expect(isFreshlySealed("2026-10-15T12:00:00", new Date(2026, 10, 8))).toBe(false);
  });
});

import { chapterBlocks } from "./percurso-story";

describe("chapterBlocks", () => {
  const raw = "Outubro de travessia\n\nVocê começou o mês assim.\n\nNas suas palavras\n“O limite quem coloca sou eu”\n\nSeu uso da Olá Aura\nVocê manteve seu espaço • 4 sessões concluídas\n\nEsta é uma leitura da AURA, não uma conclusão sobre você. Você pode confirmar ou corrigir o que não fizer sentido.";
  it("remove telemetria de uso e aviso defensivo", () => {
    const text = chapterBlocks(raw).map((b) => b.text).join(" ");
    expect(text).not.toMatch(/Seu uso|sessões concluídas|não uma conclusão/);
  });
  it("transforma falas entre aspas em citação", () => {
    expect(chapterBlocks(raw)).toContainEqual({ kind: "quote", text: "O limite quem coloca sou eu" });
  });
});

import { chapterBlocks as cb2 } from "./percurso-story";
it("relatório com aviso no mesmo parágrafo mantém a reflexão e remove telemetria", () => {
  const raw = "📊 Seu mês: 42 mensagens\n\nVocê atravessou outubro com coragem. Esta é uma leitura da AURA, não uma conclusão sobre você.\n\n“Percebi meu limite”";
  const b = cb2(raw);
  expect(b.map((x) => x.text)).toEqual(["Você atravessou outubro com coragem.", "Percebi meu limite"]);
});
