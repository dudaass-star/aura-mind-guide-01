const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get('GEMINI_API_KEY')!;

  // Generate a large enough text (~20K tokens)
  const bigText = 'You are a therapeutic AI assistant called AURA. You help users with emotional support, self-discovery, and personal growth through empathetic conversation. You use evidence-based therapeutic techniques including CBT, ACT, logotherapy, and mindfulness. Your responses are warm, genuine, and deeply human. You never give generic advice. You always ask thoughtful follow-up questions. '.repeat(100);

  console.log('Text length:', bigText.length, 'chars');

  // Test 1: system_instruction + contents
  const body1 = {
    model: 'models/gemini-2.5-pro',
    system_instruction: { parts: [{ text: bigText }] },
    contents: [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there! How are you feeling today?' }] },
    ],
    ttl: '60s',
  };

  const resp1 = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body1) }
  );
  const result1 = await resp1.text();
  console.log('Test 1 (system_instruction + contents):', resp1.status, result1);

  // Test 2: everything in contents only
  const body2 = {
    model: 'models/gemini-2.5-pro',
    contents: [
      { role: 'user', parts: [{ text: bigText + '\n\nHello' }] },
      { role: 'model', parts: [{ text: 'Hi there! How are you feeling today?' }] },
    ],
    ttl: '60s',
  };

  const resp2 = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body2) }
  );
  const result2 = await resp2.text();
  console.log('Test 2 (contents only):', resp2.status, result2);

  // If test 1 succeeded, clean up
  let cacheName1 = null;
  if (resp1.ok) {
    cacheName1 = JSON.parse(result1).name;
    // Delete it
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${cacheName1}?key=${apiKey}`, { method: 'DELETE' });
  }

  let cacheName2 = null;
  if (resp2.ok) {
    cacheName2 = JSON.parse(result2).name;
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${cacheName2}?key=${apiKey}`, { method: 'DELETE' });
  }

  return new Response(JSON.stringify({
    test1: { status: resp1.status, result: JSON.parse(result1), approach: 'system_instruction + contents' },
    test2: { status: resp2.status, result: JSON.parse(result2), approach: 'contents only' },
    textChars: bigText.length,
  }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
