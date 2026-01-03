import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate a random alphanumeric code
function generateShortCode(length: number = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { url, phone } = await req.json();
    
    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('🔗 Creating short link for URL:', url.substring(0, 50) + '...');
    
    // Try to generate a unique code (max 5 attempts)
    let code = '';
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      code = generateShortCode();
      
      // Check if code already exists
      const { data: existing } = await supabase
        .from('short_links')
        .select('id')
        .eq('code', code)
        .maybeSingle();
      
      if (!existing) {
        break;
      }
      
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      console.error('❌ Failed to generate unique short code after', maxAttempts, 'attempts');
      return new Response(JSON.stringify({ error: 'Failed to generate unique code' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Insert the short link
    const { error: insertError } = await supabase
      .from('short_links')
      .insert({
        code,
        url,
        phone: phone || null,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      });
    
    if (insertError) {
      console.error('❌ Error inserting short link:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create short link' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Build the short URL using the redirect function
    const shortUrl = `${SUPABASE_URL}/functions/v1/redirect-link?c=${code}`;
    
    console.log('✅ Short link created:', code, '→', shortUrl);
    
    return new Response(JSON.stringify({ 
      code,
      shortUrl,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('❌ Error in create-short-link:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
