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
  /** Código do "Testar eventos" do Meta: valida sem sujar os dados de produção. */
  test_event_code?: string;
  user_data: {
    email?: string;
    phone?: string;
    first_name?: string;
    /** Identificador estável de 1ª parte (cru ou já hasheado). Aceita lista. */
    external_id?: string | string[];
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
    let accessToken = Deno.env.get('META_ACCESS_TOKEN');

    // Try reading token from instagram_config DB for auto-renewal support
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && supabaseKey) {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const sb = createClient(supabaseUrl, supabaseKey);
        const { data: cfg } = await sb.from('instagram_config').select('meta_access_token').eq('id', 1).single();
        if (cfg?.meta_access_token) accessToken = cfg.meta_access_token;
      }
    } catch (_) { /* fallback to env var */ }

    if (!accessToken) {
      console.error('❌ META_ACCESS_TOKEN not configured');
      return new Response(JSON.stringify({ error: 'Missing access token' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: CapiRequest = await req.json();
    const { event_name, event_id, event_source_url, user_data, custom_data } = body;
    const testEventCode = body.test_event_code || Deno.env.get('META_TEST_EVENT_CODE') || null;

    console.log(`📊 CAPI: Sending ${event_name} event`);

    // Check matching parameters available
    const hasStrongPII = !!(user_data.email || user_data.phone || user_data.first_name || user_data.external_id);
    const hasBrowserMatch = !!(user_data.fbp || user_data.fbc);
    
    if (!hasStrongPII && !hasBrowserMatch) {
      // No PII and no browser identifiers — skip to avoid Meta error 2804050
      console.log(`⚠️ CAPI: Skipping ${event_name} — no PII or browser identifiers. Browser Pixel handles this event.`);
      return new Response(JSON.stringify({ 
        success: true, 
        skipped: true, 
        reason: 'no_match_keys',
        message: 'Event skipped server-side — no match keys available.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hash user data as required by Meta
    const hashedUserData: Record<string, string> = {};
    const hashedUserDataMulti: Record<string, string[]> = {};

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
    // external_id: aceita 1 ou vários. Já-hasheado (64 hex) passa direto.
    // É o parâmetro que mais eleva a Qualidade de Correspondência do Evento.
    const rawExternalIds = Array.isArray(user_data.external_id)
      ? user_data.external_id
      : user_data.external_id
        ? [user_data.external_id]
        : [];
    // Fallback: sem external_id explícito, deriva do telefone (mesmo valor que
    // o checkout envia) e cai no e-mail — assim Purchase/Subscribe dos webhooks
    // ganham a chave sem precisar mudar cada webhook.
    if (rawExternalIds.length === 0) {
      const fallback = user_data.phone?.replace(/\D/g, '') || user_data.email;
      if (fallback) rawExternalIds.push(fallback);
    }
    const externalIds: string[] = [];
    for (const raw of rawExternalIds) {
      const v = String(raw || '').trim();
      if (!v) continue;
      externalIds.push(/^[a-f0-9]{64}$/i.test(v) ? v.toLowerCase() : await sha256Hash(v));
    }
    if (externalIds.length === 1) hashedUserData.external_id = externalIds[0];
    else if (externalIds.length > 1) hashedUserDataMulti.external_id = [...new Set(externalIds)];
    if (user_data.client_ip_address) {
      hashedUserData.client_ip_address = user_data.client_ip_address;
    }
    else {
      // Fallback: IP real do visitante vindo do proxy (melhora a qualidade do match).
      const fwd = req.headers.get('x-forwarded-for');
      const ip = fwd ? fwd.split(',')[0].trim() : null;
      if (ip) hashedUserData.client_ip_address = ip;
    }
    if (user_data.client_user_agent) {
      hashedUserData.client_user_agent = user_data.client_user_agent;
    }
    else {
      const ua = req.headers.get('user-agent');
      if (ua) hashedUserData.client_user_agent = ua;
    }
    // fbp and fbc are passed raw (not hashed) per Meta docs
    if (user_data.fbp) {
      hashedUserData.fbp = user_data.fbp;
    }
    if (user_data.fbc) {
      hashedUserData.fbc = user_data.fbc;
    }

    const eventData: Record<string, unknown> = {
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      user_data: { ...hashedUserData, ...hashedUserDataMulti },
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

    const payload: Record<string, unknown> = {
      data: [eventData],
    };
    // Presente apenas quando explicitamente pedido — em produção fica ausente.
    if (testEventCode) payload.test_event_code = testEventCode;

    const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    // Audit log fire-and-forget — registra todo disparo p/ diagnóstico.
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && supabaseKey) {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const sb = createClient(supabaseUrl, supabaseKey);
        const fbtrace =
          (result?.fbtrace_id as string) ||
          (result?.error?.fbtrace_id as string) ||
          null;
        const metaError = !response.ok
          ? JSON.stringify(result?.error || result).slice(0, 1000)
          : null;
        sb.from('meta_capi_log').insert({
          event_name,
          event_id: event_id || null,
          source: (body as any).source || null,
          is_first_purchase: (body as any).is_first_purchase ?? null,
          email_present: !!user_data.email,
          phone_present: !!user_data.phone,
          fbp_present: !!user_data.fbp,
          fbc_present: !!user_data.fbc,
          external_id_present: externalIds.length > 0,
          request_value: custom_data?.value ?? null,
          meta_status: response.status,
          meta_fbtrace_id: fbtrace,
          meta_error: metaError,
          raw_response: result ?? null,
        }).then(({ error }) => {
          if (error) console.warn('⚠️ meta_capi_log insert failed:', error.message);
        });

        // Cache de identidade também no topo/meio do funil: guardar fbp/fbc
        // assim que o lead se identifica melhora a atribuição do Purchase de
        // quem paga depois em outro dispositivo (era o gargalo do fbc).
        if ((user_data.email || user_data.phone) && (user_data.fbp || user_data.fbc)) {
          const email = user_data.email?.trim().toLowerCase() || null;
          const digits = user_data.phone?.replace(/\D/g, '') || '';
          const phone = digits.length >= 10 ? digits : null;
          const patch: Record<string, unknown> = {
            last_source: `meta-capi:${event_name}`,
            updated_at: new Date().toISOString(),
          };
          if (user_data.fbp) patch.fbp = user_data.fbp;
          if (user_data.fbc) patch.fbc = user_data.fbc;
          let q = sb.from('meta_identity_cache').select('id').limit(1);
          q = email ? q.ilike('email', email) : q.eq('phone', phone);
          const { data: existing } = await q.maybeSingle();
          if (existing?.id) {
            if (email) patch.email = email;
            if (phone) patch.phone = phone;
            await sb.from('meta_identity_cache').update(patch).eq('id', existing.id);
          } else {
            await sb.from('meta_identity_cache').insert({ email, phone, ...patch });
          }
        }
      }
    } catch (logErr) {
      console.warn('⚠️ meta_capi_log fire-and-forget failed:', logErr);
    }

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
