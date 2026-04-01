// v3: phone guard clauses + correct user test
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { sendProactive } from "../_shared/whatsapp-provider.ts";
import { getInstanceConfigForUser } from "../_shared/instance-helper.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, message, user_id, template_category } = await req.json();
    
    console.log(`📤 [Admin] Sending message to ${phone}${user_id ? ` (user: ${user_id})` : ''} [category: ${template_category || 'checkin'}]`);

    if (!phone || !message) {
      throw new Error('Phone and message are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve instance-specific Z-API config if user_id provided
    let zapiConfig = undefined;
    if (user_id) {
      zapiConfig = await getInstanceConfigForUser(supabase, user_id);
      console.log(`📡 [Admin] Using instance config for user ${user_id}`);
    }

    const cleanPhone = cleanPhoneNumber(phone);
    
    // Use sendProactive to handle 24h window automatically (templates when outside window)
    const result = await sendProactive(cleanPhone, message, template_category || 'checkin', user_id, zapiConfig);

    if (!result.success) {
      console.error(`❌ [Admin] Send failed: provider=${result.provider}, error=${result.error}`);
      throw new Error(result.error || 'Failed to send message');
    }

    // Save message to history if user_id provided
    if (user_id) {
      await supabase.from('messages').insert({
        user_id: user_id,
        role: 'assistant',
        content: message,
      });
    }

    console.log(`✅ [Admin] Message sent via ${result.provider}`);

    return new Response(JSON.stringify({ status: 'sent', provider: result.provider }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Send error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
