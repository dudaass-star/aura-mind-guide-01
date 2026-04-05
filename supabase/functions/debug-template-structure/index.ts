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

    const body = await req.json().catch(() => ({}));
    const { check_sids } = body;

    // Check message delivery status for specific SIDs
    if (check_sids && Array.isArray(check_sids)) {
      const results = [];
      for (const sid of check_sids) {
        const res = await fetch(`${GATEWAY_URL}/Messages/${sid}.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableKey}`,
            'X-Connection-Api-Key': twilioKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          // Empty body POST to try to get message details
          body: new URLSearchParams({}),
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        results.push({ sid, status: res.status, data });
      }
      return new Response(JSON.stringify(results, null, 2), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default: list recent messages
    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'X-Connection-Api-Key': twilioKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        PageSize: '16',
        // DateSent: '2026-04-05',
      }),
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    // Extract just the relevant fields
    if (data.messages) {
      const summary = data.messages.map((m: any) => ({
        sid: m.sid,
        to: m.to,
        status: m.status,
        error_code: m.error_code,
        error_message: m.error_message,
        date_sent: m.date_sent,
      }));
      return new Response(JSON.stringify(summary, null, 2), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ status: res.status, data }, null, 2), {
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
