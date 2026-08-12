import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildFixedPixRecurringOptions } from "./woovi-subscription-payload.ts";
import { buildEmv, composeQr, crc16, parseEmv } from "./pix-emv.ts";

Deno.test("opções de recorrência fixa não incluem campos de faixa variável", () => {
  const options = buildFixedPixRecurringOptions("ONLY_RECURRENCY");
  assertEquals(options, {
    journey: "ONLY_RECURRENCY",
    retryPolicy: "THREE_RETRIES_7_DAYS",
  });
  assertEquals("minimumValue" in options, false);
  assertEquals("maximumValue" in options, false);
});

Deno.test("QR composto mantém cobrança e mandato com CRC válido", () => {
  const cobUrl = "qr.woovi.com/qr/v2/cob/74f6be33-5d9f-4448-9960-657738fb9fc0";
  const recUrl = "qr.woovi.com/qr/v2/rec/ed9d2d49-b2a2-40d8-a483-04d86fb5e486";
  const cob = buildEmv([
    { tag: "00", value: "01" },
    { tag: "01", value: "12" },
    { tag: "26", value: `0014br.gov.bcb.pix25${String(cobUrl.length).padStart(2, "0")}${cobUrl}` },
    { tag: "52", value: "0000" },
    { tag: "53", value: "986" },
    { tag: "58", value: "BR" },
    { tag: "59", value: "JUBI LTDA" },
    { tag: "60", value: "TAQUARI" },
    { tag: "62", value: "0503***" },
  ]);

  const composed = composeQr(cob, recUrl);
  assertMatch(composed, /\/cob\/74f6be33/);
  assertMatch(composed, /\/rec\/ed9d2d49/);

  const fields = parseEmv(composed);
  const crc = fields.find((field) => field.tag === "63")?.value;
  const body = composed.slice(0, -4);
  assertEquals(crc, crc16(body));
});