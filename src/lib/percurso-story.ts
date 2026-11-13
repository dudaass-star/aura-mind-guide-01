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
export function chapterBlocks(raw: string, clean: (s: string) => string = (s) => s): ChapterBlock[] {
  const blocks: ChapterBlock[] = [];
  raw = stripLegacyWhatsAppReport(raw);
  const sections = (raw || "").replace(/\r/g, "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const isTelemetry = (l: string) => /^[📊📈📉📅💬🗓️⏱️🔢✅]/u.test(l) || /\d+\s*(mensagens|sessões concluídas|minutos de áudio)/i.test(l) || /•/.test(l);
  for (const section of sections) {
    if (TELEMETRY_SECTION.test(section)) continue;
    const lines = section.split("\n").map((l) => clean(l.replace(/^#+\s*/, "")).trim()).filter(Boolean);
    let paragraph: string[] = [];
    const flush = () => { if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") }); paragraph = []; };
    for (const original of lines) {
      if (TELEMETRY_SECTION.test(original) || isTelemetry(original)) continue;
      // Remove só a frase defensiva, preservando o restante da reflexão.
      const line = original.split(/(?<=[.!?])\s+/).filter((f) => !DISCLAIMER.test(f)).join(" ").trim();
      if (!line) continue;
      if (CHAPTER_HEADINGS.test(line.replace(/:$/, ""))) { flush(); blocks.push({ kind: "heading", text: line.replace(/:$/, "") }); }
      else if (/^[“"].+[”"]$/.test(line)) { flush(); blocks.push({ kind: "quote", text: line.replace(/^[“"]|[”"]$/g, "") }); }
      else paragraph.push(line);
    }
    flush();
  }
  return blocks;
}

/**
 * Relatório mensal legado do WhatsApp (números, barras, divisórias e frase pronta):
 * preserva só a reflexão "Sua Evolução"; sem ela, não há texto de capítulo.
 */
export function stripLegacyWhatsAppReport(raw: string): string {
  const text = (raw || "").replace(/\r/g, "");
  if (!/Seu Relat[óo]rio Mensal|Seus N[úu]meros do M[êe]s|━{3,}/i.test(text)) return text;
  const parts = text.split(/━{3,}/).map((p) => p.trim());
  const evo = parts.find((p) => /Sua Evolu[çc][ãa]o/i.test(p));
  if (!evo) return "";
  return evo.replace(/^.*Sua Evolu[çc][ãa]o\*?\s*/i, "").trim();
}

// Troca expressões de laudo pela fala direta da AURA.
export function softenClinical(text: string): string {
  return text
    .replace(/\bA sess[aã]o explorou\b/gi, "A gente olhou para")
    .replace(/\bo conte[úu]do sugere\b/gi, "dá para perceber")
    .replace(/\bO per[íi]odo foi marcado pelo\b/gi, "Esse tempo teve")
    .replace(/\bParecem coexistir\b/gi, "Convivem em você")
    .replace(/\bparece refletir\b/gi, "parece carregar")
    .replace(/\bVocê mencionou\b/g, "Você contou");
}

/** Quebra parágrafos longos em trechos de até 2 frases, para a leitura respirar no celular. */
export function breatheBlocks(blocks: ChapterBlock[]): ChapterBlock[] {
  return blocks.flatMap((b) => {
    if (b.kind !== "paragraph") return [b];
    const text = softenClinical(b.text);
    const sentences = text.split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ú“"])/);
    if (text.split(/\s+/).length <= 45 || sentences.length < 3) return [{ ...b, text }];
    const out: ChapterBlock[] = [];
    for (let i = 0; i < sentences.length; i += 2) out.push({ kind: "paragraph", text: sentences.slice(i, i + 2).join(" ") });
    return out;
  });
}
