const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableKey) throw new Error('LOVABLE_API_KEY not configured');
    const twilioKey = Deno.env.get('TWILIO_API_KEY');
    if (!twilioKey) throw new Error('TWILIO_API_KEY not configured');

    const sids = [
      { name: 'aura_welcome_v2', sid: 'HXa5ef9baff62dd1648c8e37f0ca03b054' },
      { name: 'aura_welcome_trial_v2', sid: 'HXba985652a6a517aac0f9732321398dee' },
      { name: 'aura_reconnect_v2', sid: 'HX824b3f789beb78ace2a1f38d8527c718' },
    ];

    const results = [];

    for (const t of sids) {
      // Content API uses the connector gateway with /content/ prefix
      const url = `https://connector-gateway.lovable.dev/twilio/content/v1/Content/${t.sid}`;
      
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${lovableKey}`,
          'X-Connection-Api-Key': twilioKey,
        },
      });

      let data;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      results.push({ template: t.name, contentSid: t.sid, status: res.status, data });
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
