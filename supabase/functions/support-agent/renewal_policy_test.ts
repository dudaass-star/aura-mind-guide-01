import { RENEWAL_POLICY } from "./renewal-policy.ts";

Deno.test("renovação proíbe /v2 para cliente existente e exige link direto + copia e cola", () => {
  for (const rule of ["NUNCA recebem https://olaaura.com.br/v2", "renewal_url", "copy_paste", "Nunca invente código PIX"]) {
    if (!RENEWAL_POLICY.includes(rule)) throw new Error(`Regra ausente: ${rule}`);
  }
});
