/**
 * Test Twilio WhatsApp send - diagnostic function
 * Sends a template message directly to verify the gateway account matches.
 */

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
    const twilioKey = Deno.env.get('TWILIO_API_KEY');
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM');

    if (!lovableKey || !twilioKey) {
      return new Response(JSON.stringify({ error: 'Missing API keys' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const headers = {
      'Authorization': `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': twilioKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // Step 1: Check account info
    const accountRes = await fetch(`${GATEWAY_URL}/.json`, {
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'X-Connection-Api-Key': twilioKey,
      },
    });
    const accountData = await accountRes.json();
    console.log('🔍 Account info:', JSON.stringify(accountData));

    // Step 2: Check if ContentSid exists in this account
    const contentRes = await fetch(`https://connector-gateway.lovable.dev/twilio/../../../Content/v1/Content/HXa5ef9baff62dd1648c8e37f0ca03b054`, {
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'X-Connection-Api-Key': twilioKey,
      },
    });
    const contentData = await contentRes.json();
    console.log('📋 Content template info:', JSON.stringify(contentData));

    // Step 3: List content templates
    const listRes = await fetch(`https://connector-gateway.lovable.dev/twilio/../../../Content/v1/Content?PageSize=5`, {
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'X-Connection-Api-Key': twilioKey,
      },
    });
    const listData = await listRes.json();
    console.log('📋 Content list:', JSON.stringify(listData));

    // Step 4: Try send
    const to = 'whatsapp:+5551981519708';
    const from = `whatsapp:+${(fromNumber || '').replace(/\D/g, '')}`;

    console.log(`📨 Attempting send from ${from} to ${to}`);

    // Test 1: with properly formatted ContentVariables
    const contentVars = JSON.stringify({"1": "Eduardo, esta e uma mensagem de teste da AURA"});
    console.log('ContentVariables:', contentVars);
    
    const body = new URLSearchParams({
      To: to,
      From: from,
      ContentSid: 'HXa5ef9baff62dd1648c8e37f0ca03b054',
      ContentVariables: contentVars,
    });

    const sendRes = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers,
      body,
    });

    const sendData = await sendRes.json();
    console.log(`📬 Send result [${sendRes.status}]:`, JSON.stringify(sendData));

    return new Response(JSON.stringify({
      account: accountData,
      fromNumber: from,
      sendStatus: sendRes.status,
      sendResult: sendData,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
