// Seleção da prova de evolução do Percurso: a fala mais antiga ("antes") contra a mais recente ("agora").
export type EvolutionSource = { id: string; snapshot_before: string | null; snapshot_change: string | null; evidence_date: string | null; period_end: string | null };
export type Evolution = { beforeText: string; beforeDate: string; nowText: string; nowDate: string };

const dateOf = (s: EvolutionSource) => s.evidence_date || s.period_end || "";

export function pickEvolution(snapshots: EvolutionSource[]): Evolution | null {
  const dated = snapshots.filter((s) => dateOf(s)).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  const first = dated.find((s) => s.snapshot_before?.trim());
  const last = [...dated].reverse().find((s) => s.snapshot_change?.trim());
  if (!first || !last) return null;
  // Exige pelo menos ~3 semanas de distância para ser uma evolução real, não o mesmo momento.
  if (new Date(dateOf(last)).getTime() - new Date(dateOf(first)).getTime() < 20 * 86400000) return null;
  return { beforeText: first.snapshot_before!.trim(), beforeDate: dateOf(first), nowText: last.snapshot_change!.trim(), nowDate: dateOf(last) };
}

// Capítulo "selado" é anunciado só nos 7 primeiros dias do mês seguinte.
export function isFreshlySealed(chapterMonthIso: string, now = new Date()) {
  const d = new Date(chapterMonthIso);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth() && now.getDate() <= 7;
}

/** Bloco editorial de leitura de um capítulo. */
export type ChapterBlock = { kind: "heading" | "quote" | "paragraph"; text: string };

const CHAPTER_HEADINGS = /^(um possível movimento|nas suas palavras|um fio para continuar)$/i;
const TELEMETRY_SECTION = /^seu uso da ol[áa] aura/i;
const DISCLAIMER = /(leitura da aura, não uma conclusão|confirmar ou corrigir o que não fizer sentido)/i;

/**
 * Converte o texto cru do relatório/carta em blocos de leitura editorial,
 * removendo telemetria de uso e avisos defensivos herdados de capítulos antigos.
 */
export function chapterBlocks(raw: string): ChapterBlock[] {
  const blocks: ChapterBlock[] = [];
  const sections = raw.replace(/\r/g, "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  for (const section of sections) {
    if (TELEMETRY_SECTION.test(section) || DISCLAIMER.test(section)) continue;
    const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
    let paragraph: string[] = [];
    const flush = () => { if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") }); paragraph = []; };
    for (const line of lines) {
      if (CHAPTER_HEADINGS.test(line)) { flush(); blocks.push({ kind: "heading", text: line }); }
      else if (/^[“"].+[”"]$/.test(line)) { flush(); blocks.push({ kind: "quote", text: line.replace(/^[“"]|[”"]$/g, "") }); }
      else if (!DISCLAIMER.test(line) && !/•/.test(line)) paragraph.push(line);
    }
    flush();
  }
  return blocks;
}
