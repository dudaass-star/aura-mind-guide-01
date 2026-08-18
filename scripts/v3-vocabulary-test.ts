// Script simples para garantir que a landing V3 não carregue termos de
// risco de saúde no código-fonte de componentes. Executado no CI opcionalmente.
// Uso: bun scripts/v3-vocabulary-test.ts

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const GLOBS = ["src/components/v3", "src/pages/IndexV3.tsx"];

const FORBIDDEN = [
  /\bansiedade\b/gi,
  /\bdepress[ãa]o\b/gi,
  /\bcura\b/gi,
  /\bterapia\b/gi,
  /\bpsic[óo]logo\b/gi,
  /\bpsicologia\b/gi,
  /\bacompanhamento emocional\b/gi,
  /\bsess[õo]es\b/gi,
];

const ALLOWED_FILE_PATTERNS = [/.test\.(ts|tsx)$/, /\.md$/];

function scanFile(path: string, results: string[]) {
  if (ALLOWED_FILE_PATTERNS.some((p) => p.test(path))) return;
  const text = readFileSync(path, "utf-8");
  FORBIDDEN.forEach((re) => {
    const matches = text.match(re);
    if (matches && matches.length > 0) {
      results.push(`${path}: encontrado "${matches[0]}"`);
    }
  });
}

function scanDir(dir: string, results: string[]) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) {
      scanDir(path, results);
    } else if (/\.(tsx|ts|css|html)$/.test(path)) {
      scanFile(path, results);
    }
  }
}

const results: string[] = [];
for (const g of GLOBS) {
  const stat = statSync(g);
  if (stat.isDirectory()) scanDir(g, results);
  else scanFile(g, results);
}

if (results.length > 0) {
  console.error("VOCABULARY TEST FAILED");
  results.forEach((r) => console.error("  -", r));
  process.exit(1);
}

console.log("VOCABULARY TEST PASSED — V3 não contém termos de risco de saúde proibidos.");
