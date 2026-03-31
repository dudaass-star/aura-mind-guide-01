import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { sendMessage } from "../_shared/whatsapp-provider.ts";
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
    const { phone, message, user_id } = await req.json();
    
    console.log(`📤 [Admin] Sending message to ${phone}${user_id ? ` (user: ${user_id})` : ''}`);

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
    const result = await sendMessage(cleanPhone, message);

    if (!result.success) {
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

    console.log('✅ Message sent successfully');

    return new Response(JSON.stringify({ status: 'sent', zapiResponse: result.response }), {
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
