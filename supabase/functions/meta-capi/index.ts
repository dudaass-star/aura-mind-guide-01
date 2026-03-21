const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha256Hash(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface CapiRequest {
  event_name: string;
  event_id?: string;
  event_source_url?: string;
  user_data: {
    email?: string;
    phone?: string;
    first_name?: string;
    client_ip_address?: string;
    client_user_agent?: string;
    fbp?: string;
    fbc?: string;
  };
  custom_data?: {
    value?: number;
    currency?: string;
    content_name?: string;
    content_category?: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const pixelId = Deno.env.get('META_PIXEL_ID') || '939366085297921';
    const accessToken = Deno.env.get('META_ACCESS_TOKEN');

    if (!accessToken) {
      console.error('❌ META_ACCESS_TOKEN not configured');
      return new Response(JSON.stringify({ error: 'Missing access token' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: CapiRequest = await req.json();
    const { event_name, event_id, event_source_url, user_data, custom_data } = body;

    console.log(`📊 CAPI: Sending ${event_name} event`);

    // Hash user data as required by Meta
    const hashedUserData: Record<string, string> = {};

    if (user_data.email) {
      hashedUserData.em = await sha256Hash(user_data.email);
    }
    if (user_data.phone) {
      // Meta expects phone with country code, digits only
      const cleanPhone = user_data.phone.replace(/\D/g, '');
      hashedUserData.ph = await sha256Hash(cleanPhone);
    }
    if (user_data.first_name) {
      hashedUserData.fn = await sha256Hash(user_data.first_name);
    }
    if (user_data.client_ip_address) {
      hashedUserData.client_ip_address = user_data.client_ip_address;
    }
    if (user_data.client_user_agent) {
      hashedUserData.client_user_agent = user_data.client_user_agent;
    }

    const eventData: Record<string, unknown> = {
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      user_data: hashedUserData,
    };

    if (event_id) {
      eventData.event_id = event_id;
    }
    if (event_source_url) {
      eventData.event_source_url = event_source_url;
    }
    if (custom_data) {
      eventData.custom_data = custom_data;
    }

    const payload = {
      data: [eventData],
    };

    const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('❌ CAPI error:', JSON.stringify(result));
      return new Response(JSON.stringify({ error: 'CAPI request failed', details: result }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ CAPI ${event_name} sent:`, JSON.stringify(result));

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ CAPI error:', error);
    return new Response(JSON.stringify({ error: 'CAPI processing failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
