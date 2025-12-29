import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('📩 Z-API Webhook received:', JSON.stringify(payload, null, 2));

    // Extract message data from Z-API payload
    const phone = payload.phone || payload.from;
    const message = payload.text?.message || payload.body || '';
    const isFromMe = payload.fromMe || payload.isFromMe || false;

    // Ignore messages sent by the bot itself
    if (isFromMe) {
      console.log('⏭️ Ignoring own message');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'own_message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ignore empty messages
    if (!message || !phone) {
      console.log('⏭️ Missing message or phone');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'missing_data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Clean phone number (remove @c.us suffix if present)
    const cleanPhone = phone.replace('@c.us', '').replace(/\D/g, '');
    console.log(`📱 Processing message from: ${cleanPhone}`);
    console.log(`💬 Message: ${message}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find user by phone
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('phone', cleanPhone)
      .single();

    if (profileError || !profile) {
      console.log('⚠️ User not found for phone:', cleanPhone);
      // Could send a message back saying they need to register
      return new Response(JSON.stringify({ status: 'user_not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`👤 Found user: ${profile.name} (${profile.user_id})`);

    // Call the aura-agent function to process the message
    const agentResponse = await fetch(`${supabaseUrl}/functions/v1/aura-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        message: message,
        user_id: profile.user_id,
        phone: cleanPhone,
      }),
    });

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text();
      console.error('❌ aura-agent error:', errorText);
      throw new Error(`Agent error: ${errorText}`);
    }

    const agentData = await agentResponse.json();
    console.log('🤖 Agent response:', JSON.stringify(agentData, null, 2));

    // Send response messages via Z-API
    const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID')!;
    const zapiToken = Deno.env.get('ZAPI_TOKEN')!;

    for (const msg of agentData.messages || []) {
      // Add delay between messages for natural feel
      if (msg.delay) {
        await new Promise(resolve => setTimeout(resolve, msg.delay));
      }

      const sendResponse = await fetch(
        `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-text`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: cleanPhone,
            message: msg.content,
          }),
        }
      );

      if (!sendResponse.ok) {
        const sendError = await sendResponse.text();
        console.error('❌ Z-API send error:', sendError);
      } else {
        console.log('✅ Message sent successfully');
      }
    }

    return new Response(JSON.stringify({ status: 'success', messagesCount: agentData.messages?.length || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Webhook error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
