import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { allocateInstance, getInstanceConfigById } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, phone } = await req.json();

    console.log('📝 Starting trial for:', name, email, phone?.substring(0, 4) + '***');

    // Validação
    if (!name || !phone) {
      return new Response(JSON.stringify({ error: 'Nome e telefone são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validação de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: 'Email inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Limpar telefone
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Validar formato do telefone
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      return new Response(JSON.stringify({ error: 'Telefone inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Adicionar código do país se não tiver
    const formattedPhone = cleanPhone.length === 11 
      ? `55${cleanPhone}` 
      : cleanPhone.length === 10 
        ? `55${cleanPhone}` 
        : cleanPhone;

    // Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar se já existe
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, phone, status, trial_conversations_count')
      .eq('phone', formattedPhone)
      .maybeSingle();

    if (existingProfile) {
      console.log('⚠️ User already exists:', existingProfile.id);
      return new Response(JSON.stringify({ 
        alreadyExists: true,
        message: 'Este número já tem um cadastro'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Alocar instância WhatsApp (roleta distribuída)
    const instanceId = await allocateInstance(supabase);
    console.log(`📱 Allocated WhatsApp instance: ${instanceId || 'fallback (env vars)'}`);

    // Criar user_id único (não vinculado ao auth)
    const userId = crypto.randomUUID();

    // Criar perfil com trial
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        user_id: userId,
        name: name.trim(),
        email: email.trim(),
        phone: formattedPhone,
        status: 'trial',
        trial_started_at: new Date().toISOString(),
        trial_conversations_count: 0,
        plan: null,
        current_journey_id: 'j1-ansiedade',
        current_episode: 0,
        whatsapp_instance_id: instanceId,
      })
      .select()
      .single();

    if (profileError) {
      console.error('❌ Error creating profile:', profileError);
      throw profileError;
    }

    console.log('✅ Trial profile created:', profile.id);

    // Obter config da instância alocada para enviar mensagem de boas-vindas
    let zapiConfig = undefined;
    if (instanceId) {
      try {
        zapiConfig = await getInstanceConfigById(supabase, instanceId);
      } catch (e) {
        console.warn('⚠️ Could not get instance config, using env vars');
      }
    }

    const welcomeMessage = `Oi, ${name.trim()}! 💜

Que bom que você decidiu me conhecer! Eu sou a AURA.

Vou estar com você nessas primeiras 5 conversas. Pode falar comigo sobre qualquer coisa — sem julgamento, no seu ritmo.

Me conta: como você está se sentindo agora?`;

    try {
      const result = await sendTextMessage(formattedPhone, welcomeMessage, undefined, zapiConfig);
      if (result.success) {
        console.log('✅ Welcome message sent');
      } else {
        console.error('⚠️ Welcome message error:', result.error);
      }
    } catch (zapiError) {
      console.error('⚠️ Z-API error (non-blocking):', zapiError);
    }

    return new Response(JSON.stringify({ 
      success: true,
      profileId: profile.id,
      message: 'Trial iniciado com sucesso'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Start trial error:', error);
    return new Response(JSON.stringify({ error: 'Erro ao iniciar trial' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
