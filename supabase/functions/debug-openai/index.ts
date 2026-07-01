Deno.serve(async () => {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return new Response(JSON.stringify({ err: 'no key' }), { status: 500 });
  // Try a whisper transcription with a tiny silent wav
  // Generate a minimal WAV (0.1s silence, 16kHz mono)
  const sampleRate = 16000;
  const samples = new Int16Array(sampleRate / 10);
  const dataSize = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); dv.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  writeStr(36, 'data'); dv.setUint32(40, dataSize, true);
  new Int16Array(buf, 44).set(samples);
  const blob = new Blob([buf], { type: 'audio/wav' });
  const fd = new FormData();
  fd.append('file', blob, 'silence.wav');
  fd.append('model', 'whisper-1');
  fd.append('language', 'pt');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  const text = await r.text();
  return new Response(JSON.stringify({ status: r.status, body: text.slice(0, 800) }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
