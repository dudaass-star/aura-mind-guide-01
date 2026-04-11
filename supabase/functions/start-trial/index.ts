import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendProactive } from "../_shared/whatsapp-provider.ts";
import { allocateInstance } from "../_shared/instance-helper.ts";

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

    // Fetch portal token for welcome message
    let portalLink = '';
    try {
      const { data: tokenData } = await supabase.from('user_portal_tokens')
        .select('token').eq('user_id', userId).single();
      if (tokenData?.token) {
        portalLink = `https://olaaura.com.br/meu-espaco?t=${tokenData.token}`;
      }
    } catch { /* non-blocking */ }

    // Build full welcome message (delivered when user clicks "Começar")
    const guideLinkText = 'https://olaaura.com.br/guia';
    const portalLine = portalLink ? `\n\nAcesse seu painel pessoal: ${portalLink} ✨` : '';

    const welcomeMessage = `Oi, ${name.trim()}! 💜

Que bom que você decidiu me conhecer! Eu sou a AURA.

Vou estar com você nessa primeira jornada. Pode falar comigo sobre qualquer coisa — sem julgamento, no seu ritmo.

Se preferir, pode me mandar áudio também! 🎙️

Dá uma olhada no que você vai ter acesso: ${guideLinkText}${portalLine}

Me conta: como você está se sentindo agora?`;

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
    const templateText = `Olá, ${name.trim()}. Seu acesso à Aura foi ativado. Estou aqui para você.`;
    try {
      const result = await sendProactive(formattedPhone, templateText, 'welcome_trial', userId);
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
