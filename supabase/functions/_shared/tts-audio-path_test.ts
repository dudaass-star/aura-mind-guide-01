import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ttsPathFromMessage } from "./tts-audio-path.ts";

Deno.test("usa o caminho gravado na mensagem", () => {
  assertEquals(ttsPathFromMessage({ tts_storage_path: "u1/a.mp3" }, null), "u1/a.mp3");
});

Deno.test("recupera o caminho de mensagens antigas pelo link assinado", () => {
  const url = "https://x.supabase.co/storage/v1/object/sign/aura-tts-audios/u1/123-abc.mp3?token=eyJ";
  assertEquals(ttsPathFromMessage({}, url), "u1/123-abc.mp3");
});

Deno.test("ignora links de outros buckets", () => {
  assertEquals(ttsPathFromMessage(null, "https://x/storage/v1/object/sign/chat-audios/u1/a.webm?token=1"), null);
});
