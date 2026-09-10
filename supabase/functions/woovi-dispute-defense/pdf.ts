// Gerador de PDF mínimo (texto puro) para o dossiê de defesa de disputa.
//
// Por que não uma lib: o Deno da borda não tem headless browser e as libs de PDF
// pesam/quebram no deploy. O dossiê é texto tabulado — um PDF de texto com
// Helvetica/WinAnsi resolve, é auditável e não adiciona dependência.
//
// Acento: Helvetica com WinAnsiEncoding cobre latin-1, então escrevemos os bytes
// em latin-1. Caractere fora da tabela vira "?" em vez de corromper o arquivo.

export interface PdfLine {
  text: string;
  size?: number;
  bold?: boolean;
  /** Espaço extra (pt) antes da linha. */
  gap?: number;
}

const PAGE_W = 595; // A4
const PAGE_H = 842;
const MARGIN = 56;
const MAX_CHARS = 92; // quebra conservadora para 9-10pt

// Pontuação tipográfica que existe no WinAnsi mas fora do latin-1 puro: sem
// este mapa travessão e aspas curvas viravam "?" no documento.
const WIN_ANSI: Record<number, number> = {
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95, // •
  0x2026: 0x85, // …
  0x20ac: 0x80,
  0x2122: 0x99,
};

function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i] = c <= 0xff ? c : (WIN_ANSI[c] ?? 0x3f);
  }
  return out;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Quebra em larguras seguras sem cortar palavra no meio. */
function wrap(text: string, max = MAX_CHARS): string[] {
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= max) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

export function buildPdf(lines: PdfLine[]): Uint8Array {
  // 1) Paginação
  const pages: string[][] = [];
  let stream: string[] = [];
  let y = PAGE_H - MARGIN;

  const push = (op: string) => stream.push(op);
  const newPage = () => {
    if (stream.length) pages.push(stream);
    stream = [];
    y = PAGE_H - MARGIN;
  };

  for (const raw of lines) {
    const size = raw.size ?? 10;
    const font = raw.bold ? "/F2" : "/F1";
    const lead = size + 4;
    y -= raw.gap ?? 0;
    for (const piece of wrap(raw.text, Math.floor(MAX_CHARS * (10 / size)))) {
      if (y < MARGIN + lead) newPage();
      push(`BT ${font} ${size} Tf ${MARGIN} ${y.toFixed(1)} Td (${esc(piece)}) Tj ET`);
      y -= lead;
    }
  }
  if (stream.length) pages.push(stream);
  if (!pages.length) pages.push([]);

  // 2) Objetos
  const objects: string[] = [];
  const pageObjStart = 5; // 1 catalog, 2 pages, 3 F1, 4 F2
  const pageIds: number[] = [];
  const contents: { id: number; body: string }[] = [];

  pages.forEach((ops, i) => {
    const pageId = pageObjStart + i * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    contents.push({ id: contentId, body: ops.join("\n") });
  });

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${
    pageIds.map((id) => `${id} 0 R`).join(" ")
  }] >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  pageIds.forEach((pageId, i) => {
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contents[i].id} 0 R >>`;
    objects[contents[i].id] =
      `<< /Length ${latin1(contents[i].body).length} >>\nstream\n${contents[i].body}\nendstream`;
  });

  // 3) Serialização com xref
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [];
  const add = (s: string) => {
    const b = latin1(s);
    chunks.push(b);
    offset += b.length;
  };

  add("%PDF-1.4\n");
  for (let i = 1; i < objects.length; i++) {
    if (!objects[i]) continue;
    offsets[i] = offset;
    add(`${i} 0 obj\n${objects[i]}\nendobj\n`);
  }
  const xrefAt = offset;
  const maxId = objects.length;
  let xref = `xref\n0 ${maxId}\n0000000000 65535 f \n`;
  for (let i = 1; i < maxId; i++) {
    xref += `${String(offsets[i] ?? 0).padStart(10, "0")} 00000 ${offsets[i] ? "n" : "f"} \n`;
  }
  add(xref);
  add(`trailer\n<< /Size ${maxId} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
