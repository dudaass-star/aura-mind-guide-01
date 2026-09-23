import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendProactive } from "../_shared/whatsapp-provider.ts";
import { allocateInstance } from "../_shared/instance-helper.ts";
import { normalizeBrazilianPhone } from "../_shared/zapi-client.ts";

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

    // Adicionar código do país e normalizar
    const formattedPhone = normalizeBrazilianPhone(cleanPhone);

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
        current_journey_id: null,
        current_episode: 0,
        last_content_sent_at: null,
        whatsapp_instance_id: instanceId,
      })
      .select()
      .single();

    if (profileError) {
      console.error('❌ Error creating profile:', profileError);
      throw profileError;
    }

    console.log('✅ Trial profile created:', profile.id);

    // Generate portal token
    try {
      await supabase.from('user_portal_tokens').upsert(
        { user_id: userId },
        { onConflict: 'user_id' }
      );
      console.log('✅ Portal token created for trial user');
    } catch (tokenErr) {
      console.warn('⚠️ Portal token creation failed (non-blocking):', tokenErr);
    }

    // Lead CAPI event removed — trial flow now goes directly to /checkout (Stripe)
    // The start-trial function is only used as a legacy fallback

    // Build full welcome message (delivered when user clicks "Começar")
    const welcomeMessage = `Oi, ${name.trim()}! Seu acesso ao app Olá Aura está liberado ✨

É no app que você conversa comigo por texto ou áudio e encontra tudo o que está disponível nesta primeira jornada.

Abra agora: https://olaaura.com.br/meu-espaco`;

    // Save full welcome as pending_insight with [WELCOME] marker
    try {
      await supabase.from('profiles').update({
        pending_insight: `[WELCOME]${welcomeMessage}`,
      }).eq('user_id', userId);
      console.log('✅ Pending welcome saved for delivery on user interaction');
    } catch (pendErr) {
      console.warn('⚠️ Could not save pending welcome:', pendErr);
    }

    // Send short template via WhatsApp
    const templateText = `Olá, ${name.trim()}. Seu acesso ao app Olá Aura foi liberado.`;
    try {
      const result = await sendProactive(formattedPhone, templateText, 'welcome', userId);
      if (result.success) {
        console.log('✅ Welcome template sent via', result.provider);
      } else {
        console.error('⚠️ Welcome template error:', result.error);
      }
    } catch (msgError) {
      console.error('⚠️ Welcome template error (non-blocking):', msgError);
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
