const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableKey) throw new Error('LOVABLE_API_KEY not configured');
    const twilioKey = Deno.env.get('TWILIO_API_KEY');
    if (!twilioKey) throw new Error('TWILIO_API_KEY not configured');

    // Content SIDs to inspect
    const sids = [
      { name: 'aura_welcome_v2', sid: 'HXa5ef9baff62dd1648c8e37f0ca03b054' },
      { name: 'aura_welcome_trial_v2', sid: 'HXba985652a6a517aac0f9732321398dee' },
      { name: 'aura_reconnect_v2', sid: 'HX824b3f789beb78ace2a1f38d8527c718' },
    ];

    const results = [];

    for (const t of sids) {
      // Twilio Content API is v1, not under Accounts — use direct path
      const url = `${GATEWAY_URL}/../Content/v1/Content/${t.sid}`;
      // Actually the gateway prefixes /2010-04-01/Accounts/{AccountSid}
      // Content API is at /v1/Content/{sid} which is a different base
      // Let's try the gateway with a custom approach
      
      // The connector gateway prepends /2010-04-01/Accounts/{AccountSid}
      // but Content API lives at https://content.twilio.com/v1/Content/{sid}
      // So we need to call content.twilio.com directly with basic auth
      // But we don't have credentials directly... Let's try via gateway anyway
      
      const res = await fetch(`https://content.twilio.com/v1/Content/${t.sid}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${lovableKey}`,
          'X-Connection-Api-Key': twilioKey,
        },
      });

      let data;
      try {
        data = await res.json();
      } catch {
        data = { error: `HTTP ${res.status}`, body: await res.text() };
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
