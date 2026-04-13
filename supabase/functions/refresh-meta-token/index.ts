import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Read current config
    const { data: config, error: configErr } = await supabase
      .from("instagram_config")
      .select("meta_access_token, token_expires_at")
      .eq("id", 1)
      .single();

    if (configErr || !config) {
      console.error("Failed to read instagram_config:", configErr);
      return new Response(JSON.stringify({ error: "Config not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if renewal is needed (within 7 days of expiry)
    const currentToken = config.meta_access_token || Deno.env.get("META_ACCESS_TOKEN");
    if (!currentToken) {
      return new Response(JSON.stringify({ error: "No token available to refresh" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (config.token_expires_at) {
      const expiresAt = new Date(config.token_expires_at);
      const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntilExpiry > 7) {
        console.log(`Token still valid for ${Math.round(daysUntilExpiry)} days, skipping renewal`);
        return new Response(JSON.stringify({ 
          skipped: true, 
          days_remaining: Math.round(daysUntilExpiry) 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const appId = Deno.env.get("INSTAGRAM_APP_ID");
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET");

    if (!appId || !appSecret) {
      return new Response(JSON.stringify({ error: "INSTAGRAM_APP_ID or INSTAGRAM_APP_SECRET not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange for new long-lived token
    const url = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${currentToken}`;
    
    const resp = await fetch(url);
    const data = await resp.json();

    if (!resp.ok || data.error) {
      console.error("Meta token refresh failed:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "Token refresh failed", details: data.error }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newToken = data.access_token;
    const expiresIn = data.expires_in || 5184000; // default 60 days
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Store in DB
    const { error: updateErr } = await supabase
      .from("instagram_config")
      .update({ 
        meta_access_token: newToken, 
        token_expires_at: expiresAt 
      })
      .eq("id", 1);

    if (updateErr) {
      console.error("Failed to save new token:", updateErr);
      return new Response(JSON.stringify({ error: "Failed to save token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ Meta token refreshed, expires at ${expiresAt}`);

    return new Response(JSON.stringify({ 
      success: true, 
      expires_at: expiresAt,
      expires_in_days: Math.round(expiresIn / 86400)
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Token refresh error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
