import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Get the code from query params
    const url = new URL(req.url);
    const code = url.searchParams.get('c');
    
    if (!code) {
      console.error('❌ No code provided');
      return new Response('Link inválido', {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    
    console.log('🔗 Looking up short code:', code);
    
    // Look up the short link
    const { data: shortLink, error } = await supabase
      .from('short_links')
      .select('url, expires_at')
      .eq('code', code)
      .maybeSingle();
    
    if (error || !shortLink) {
      console.error('❌ Short link not found:', code, error);
      return new Response('Link não encontrado ou expirado', {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    
    // Check if expired
    if (shortLink.expires_at && new Date(shortLink.expires_at) < new Date()) {
      console.log('⏰ Short link expired:', code);
      return new Response('Este link expirou. Por favor, solicite um novo link.', {
        status: 410,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    
    console.log('✅ Redirecting to:', shortLink.url.substring(0, 50) + '...');
    
    // Redirect to the original URL
    return new Response(null, {
      status: 302,
      headers: {
        'Location': shortLink.url,
      },
    });
    
  } catch (error) {
    console.error('❌ Error in redirect-link:', error);
    return new Response('Erro ao processar o link', {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
});
