const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get('GEMINI_API_KEY')!;

  // First, list available models to find the exact name
  const listResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  const models = await listResp.json();
  const proModels = (models.models || [])
    .filter((m: any) => m.name.includes('2.5-pro') || m.name.includes('2.5-flash'))
    .map((m: any) => ({ name: m.name, displayName: m.displayName, supportedMethods: m.supportedGenerationMethods }));

  console.log('Available models:', JSON.stringify(proModels, null, 2));

  // Try creating cache with the first 2.5-pro model found
  const proModel = proModels.find((m: any) => m.name.includes('2.5-pro'));
  const modelName = proModel?.name || 'models/gemini-2.5-pro';

  console.log('Attempting cache with model:', modelName);

  const cacheBody = {
    model: modelName,
    system_instruction: { parts: [{ text: 'You are a helpful assistant. '.repeat(500) }] },
    contents: [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there!' }] },
    ],
    ttl: '60s',
  };

  const cacheResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cacheBody),
    }
  );

  const cacheResult = await cacheResp.text();
  console.log('Cache response:', cacheResp.status, cacheResult);

  return new Response(JSON.stringify({
    proModels,
    cacheModelUsed: modelName,
    cacheStatus: cacheResp.status,
    cacheResult: JSON.parse(cacheResult),
  }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
