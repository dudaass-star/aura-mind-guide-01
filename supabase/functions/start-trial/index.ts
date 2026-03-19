import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { allocateInstance, getInstanceConfigById } from "../_shared/instance-helper.ts";

async function createShortLink(supabaseUrl: string, serviceKey: string, url: string, phone?: string): Promise<string | null> {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/create-short-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ url, phone }),
    });
    if (resp.ok) {
      const data = await resp.json();
      return data.shortUrl || null;
    }
    return null;
  } catch {
    return null;
  }
}

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
    const { name, email, phone, event_id } = await req.json();

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

    // Lead CAPI event removed — trial flow now goes directly to /checkout (Stripe)
    // The start-trial function is only used as a legacy fallback

    // Obter config da instância alocada para enviar mensagem de boas-vindas
    let zapiConfig = undefined;
    if (instanceId) {
      try {
        zapiConfig = await getInstanceConfigById(supabase, instanceId);
      } catch (e) {
        console.warn('⚠️ Could not get instance config, using env vars');
      }
    }

    // Link direto para o guia (sem short link para manter URL amigável no WhatsApp)
    const guideLinkText = 'https://olaaura.com.br/guia';

    const welcomeMessage = `Oi, ${name.trim()}! 💜

Que bom que você decidiu me conhecer! Eu sou a AURA.

Vou estar com você nessa primeira jornada. Pode falar comigo sobre qualquer coisa — sem julgamento, no seu ritmo.

Dá uma olhada no que você vai ter acesso: ${guideLinkText} ✨

Me conta: como você está se sentindo agora?`;

    try {
      const result = await sendTextMessage(formattedPhone, welcomeMessage, undefined, zapiConfig);
      if (result.success) {
        console.log('✅ Welcome message sent');

        // Save welcome message to history so it appears in admin panel
        await supabase.from('messages').insert({
          user_id: userId,
          role: 'assistant',
          content: welcomeMessage,
        });

        // Segunda mensagem: informar sobre funcionalidade de áudio
        try {
          const audioMsg = `Ah, e se preferir, pode me mandar áudio também! 🎙️ Eu ouço e respondo — por texto ou por voz, como você preferir.`;
          await sendTextMessage(formattedPhone, audioMsg, 3, zapiConfig);
          console.log('✅ Audio info message sent');

          await supabase.from('messages').insert({
            user_id: userId,
            role: 'assistant',
            content: audioMsg,
          });
        } catch (audioMsgError) {
          console.warn('⚠️ Audio info message failed (non-blocking):', audioMsgError);
        }
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
