const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get('GEMINI_API_KEY')!;
  const results: any[] = [];

  // Test: Minimal cache with gemini-2.5-flash (lower min token: 1024)
  const bigText = 'This is test content for caching. '.repeat(200);

  // Test A: gemini-2.5-flash
  const bodyA = {
    model: 'models/gemini-2.5-flash',
    contents: [
      { role: 'user', parts: [{ text: bigText }] },
      { role: 'model', parts: [{ text: 'Understood.' }] },
    ],
    ttl: '60s',
  };
  const respA = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyA) }
  );
  const txtA = await respA.text();
  results.push({ test: 'flash-contents-only', status: respA.status, body: txtA.slice(0, 500) });

  // Test B: Try with expire_time instead of ttl
  const expireTime = new Date(Date.now() + 120000).toISOString();
  const bodyB = {
    model: 'models/gemini-2.5-flash',
    contents: [
      { role: 'user', parts: [{ text: bigText }] },
      { role: 'model', parts: [{ text: 'Understood.' }] },
    ],
    expireTime: expireTime,
  };
  const respB = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyB) }
  );
  const txtB = await respB.text();
  results.push({ test: 'flash-expireTime', status: respB.status, body: txtB.slice(0, 500) });

  // Test C: camelCase fields (maybe API wants camelCase for some fields?)
  const bodyC = {
    model: 'models/gemini-2.5-flash',
    systemInstruction: { parts: [{ text: bigText }] },
    contents: [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi' }] },
    ],
    ttl: '60s',
  };
  const respC = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyC) }
  );
  const txtC = await respC.text();
  results.push({ test: 'flash-camelCase-systemInstruction', status: respC.status, body: txtC.slice(0, 500) });

  // Clean up any successful caches
  for (const r of results) {
    if (r.status === 200) {
      try {
        const parsed = JSON.parse(r.body);
        if (parsed.name) {
          await fetch(`https://generativelanguage.googleapis.com/v1beta/${parsed.name}?key=${apiKey}`, { method: 'DELETE' });
        }
      } catch {}
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
