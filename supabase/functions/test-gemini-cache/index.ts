const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get('GEMINI_API_KEY')!;

  // Test 1: Confirm generateContent works
  const genResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say hi' }] }],
        generationConfig: { maxOutputTokens: 10 },
      }),
    }
  );
  const genTxt = await genResp.text();

  // Test 2: Try caching with GOOGLE_CLOUD_API_KEY instead
  const gcpKey = Deno.env.get('GOOGLE_CLOUD_API_KEY');
  let gcpResult = 'no key';
  let gcpStatus = 0;
  if (gcpKey) {
    const bigText = 'You are an expert assistant. '.repeat(300);
    const cacheResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${gcpKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-2.5-flash',
          contents: [
            { role: 'user', parts: [{ text: bigText }] },
            { role: 'model', parts: [{ text: 'OK' }] },
          ],
          ttl: '60s',
        }),
      }
    );
    gcpResult = await cacheResp.text();
    gcpStatus = cacheResp.status;

    // cleanup
    if (cacheResp.ok) {
      try {
        const name = JSON.parse(gcpResult).name;
        await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${gcpKey}`, { method: 'DELETE' });
      } catch {}
    }
  }

  // Test 3: Try list existing caches (to see if API is accessible)
  const listResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`
  );
  const listTxt = await listResp.text();

  return new Response(JSON.stringify({
    generateContent: { status: genResp.status, works: genResp.ok },
    cacheWithGCPKey: { status: gcpStatus, result: gcpResult.slice(0, 300) },
    listCaches: { status: listResp.status, result: listTxt.slice(0, 300) },
    keyPrefix: apiKey.slice(0, 10) + '...',
    gcpKeyAvailable: !!gcpKey,
  }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
