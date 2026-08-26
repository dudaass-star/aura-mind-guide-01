// Gera um magic link real (Supabase Auth) pro /meu-espaco.
// Uso: suporte/admin, quando o cliente não recebe o código por email
// (ex.: filtro de Hotmail/Outlook). Somente admins autenticados.
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    // 1) valida o chamador como admin
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) throw new Error('unauthorized');
    const asCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await asCaller.auth.getClaims();
    const callerId = claims?.claims?.sub as string | undefined;
    if (!callerId) throw new Error('unauthorized');

    const { data: isAdmin } = await admin.rpc('has_role', {
      _user_id: callerId,
      _role: 'admin',
    });
    if (!isAdmin) throw new Error('forbidden');

    // 2) resolve o email do cliente (por profile_id, email ou telefone)
    const body = await req.json().catch(() => ({}));
    let email: string | null = (body.email ?? null)?.toString()?.trim()?.toLowerCase() || null;
    const redirectTo: string = body.redirect_to || 'https://olaaura.com.br/meu-espaco';

    if (!email && (body.profile_id || body.phone)) {
      const query = admin.from('profiles').select('email, phone').limit(1);
      const { data: profile } = body.profile_id
        ? await query.eq('id', body.profile_id).maybeSingle()
        : await query.eq('phone', String(body.phone).replace(/\D/g, '')).maybeSingle();
      email = profile?.email?.toLowerCase() ?? null;
    }

    if (!email) throw new Error('email_not_found');

    // 3) gera o magic link (cria o usuário se ainda não existir)
    let { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });

    if (error && /not found|does not exist/i.test(error.message)) {
      const signup = await admin.auth.admin.generateLink({
        type: 'signup',
        email,
        password: crypto.randomUUID(),
        options: { redirectTo },
      });
      data = signup.data;
      error = signup.error;
    }
    if (error) throw new Error(error.message);

    const link = data?.properties?.action_link;
    if (!link) throw new Error('link_generation_failed');

    console.log(`🔑 [magic-link] gerado para ${email} por admin ${callerId}`);

    return new Response(
      JSON.stringify({ status: 'ok', email, link, expires_in_minutes: 60 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error('❌ [magic-link]', message);
    const status = message === 'unauthorized' ? 401 : message === 'forbidden' ? 403 : 400;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
