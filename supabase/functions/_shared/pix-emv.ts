// ============= Utilitário de composição de BR Code (Pix) — Jornada composta =
//
// O Banco Inter só implementa a Jornada 2 (pagamento e autorização separados),
// o que quebrava a promo "1ª semana R$ 6,90 + mensal cheio num único scan". A
// Woovi faz a Jornada 3 nativa, mas nela o mandato sai como "valor variável" no
// app do banco (não dá pra fixar um valor de entrada diferente do recorrente).
//
// Para mostrar "R$ 29,90/mês" FIXO no app do banco e ainda cobrar R$ 6,90 na
// entrada, compsomos o BR Code manualmente: pegamos o QR de uma cobrança avulsa
// (cob, tag 26 com a URL /cob/) e injetamos a tag 80 (URL /rec/ do mandato da
// Jornada 2). O banco lê os dois e executa pagamento + autorização no mesmo
// scan — exatamente como o antigo QR integrado do Asaas.
//
// Tudo aqui é puro string/CRC, sem dependências. O algoritmo de CRC é o
// CRC16-CCITT (polinômio 0x1021, init 0xFFFF, sem XOR final) — o mesmo do BR
// Code do Pix. Validado por round-trip contra um EMV composto real da Woovi.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export interface EmvField {
  tag: string;
  value: string;
}

/** CRC16-CCITT (X9.3 / BR Code): poly 0x1021, init 0xFFFF, MSB-first, sem XOR final. */
export function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Parser TLV do BR Code. Tags têm 2 dígitos; o comprimento é decimal de 2
 * dígitos (todos os campos do Pix cabem em <100). Retorna os campos na ordem,
 * incluindo a tag 63 (CRC) se presente.
 */
export function parseEmv(emv: string): EmvField[] {
  const fields: EmvField[] = [];
  let i = 0;
  while (i < emv.length) {
    const tag = emv.slice(i, i + 2);
    i += 2;
    const len = parseInt(emv.slice(i, i + 2), 10);
    if (isNaN(len)) break; // safety
    i += 2;
    fields.push({ tag, value: emv.slice(i, i + len) });
    i += len;
  }
  return fields;
}

/** Monta um BR Code a partir dos campos e anexa a tag 63 (CRC) recalculada. */
export function buildEmv(fields: EmvField[]): string {
  let s = "";
  for (const f of fields) {
    s += f.tag + f.value.length.toString().padStart(2, "0") + f.value;
  }
  return s + "6304" + crc16(s + "6304");
}

/** Extrai a URL /cob/ ou /rec/ da Woovi de dentro de um BR Code (UUID estrito). */
export function extractWooviUrl(emv: string, kind: "cob" | "rec"): string | null {
  const re = new RegExp(`qr\\.woovi\\.com/qr/v2/${kind}/${UUID}`);
  const m = emv.match(re);
  return m ? m[0] : null;
}

/**
 * Compõe um BR Code de Jornada composta a partir de:
 *   - `cobBrCode`: o BR Code da cobrança avulsa de entrada (tem a tag 26 /cob/)
 *   - `recUrl`: a URL do mandato recorrente (/rec/), extraída do EMV da Jornada 2
 *
 * Estrutura espelha o EMV composto real da Woovi:
 *   00=01, 01=12, 26(cob), 52, 53, 58, 59, 60, 62=0503***, 80(rec), 63(CRC)
 * Os campos de identidade do recebedor (52,53,58,59,60) vêm do próprio cobBrCode
 * (mesma conta, sempre corretos); 62 é forçado para o padrão de QR com URL.
 */
export function composeQr(cobBrCode: string, recUrl: string): string {
  const map = new Map<string, string>();
  for (const f of parseEmv(cobBrCode)) {
    if (f.tag !== "63") map.set(f.tag, f.value);
  }
  const get = (tag: string, def: string) => (map.has(tag) ? map.get(tag)! : def);

  const fields: EmvField[] = [
    { tag: "00", value: "01" },
    { tag: "01", value: "12" },
    { tag: "26", value: get("26", "") },
    { tag: "52", value: get("52", "0000") },
    { tag: "53", value: get("53", "986") },
    { tag: "58", value: get("58", "BR") },
    { tag: "59", value: map.get("59") || "JUBI LTDA" },
    { tag: "60", value: map.get("60") || "TAQUARI" },
    { tag: "62", value: "0503***" },
    { tag: "80", value: "0014br.gov.bcb.pix2559" + recUrl },
  ];
  return buildEmv(fields);
}
