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
    const payload = await req.json();
    const phone = payload.phone;
    const message = payload.message;
    const userId = payload.user_id ?? payload.userId;
    const templateCategory = payload.template_category ?? payload.templateCategory ?? 'checkin';

    console.log(`📤 [Admin] Sending message to ${phone}${userId ? ` (user: ${userId})` : ''} [category: ${templateCategory}]`);

    if (!phone || !message) {
      throw new Error('Phone and message are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let zapiConfig = undefined;
    if (userId) {
      zapiConfig = await getInstanceConfigForUser(supabase, userId);
      console.log(`📡 [Admin] Using instance config for user ${userId}`);
    }

    const cleanPhone = cleanPhoneNumber(phone);
    const result = await sendProactive(cleanPhone, message, templateCategory, userId, zapiConfig);

    if (!result.success) {
      console.error(`❌ [Admin] Send failed: provider=${result.provider}, error=${result.error}`);
      throw new Error(result.error || 'Failed to send message');
    }

    if (userId) {
      await supabase.from('messages').insert({
        user_id: userId,
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
