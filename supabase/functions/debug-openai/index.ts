Deno.serve(async () => {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return new Response(JSON.stringify({ err: 'no key' }), { status: 500 });
  const r = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await r.text();
  return new Response(JSON.stringify({ status: r.status, body: text.slice(0, 800), keyPrefix: key.slice(0, 10), keyLen: key.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
