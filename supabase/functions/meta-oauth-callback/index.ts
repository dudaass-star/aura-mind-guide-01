import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const redirectBase = url.searchParams.get("state") || "https://aura-mind-guide-01.lovable.app";

    if (error) {
      console.error("OAuth error from Meta:", error, url.searchParams.get("error_description"));
      return Response.redirect(`${redirectBase}/admin/instagram?oauth_error=${encodeURIComponent(error)}`, 302);
    }

    if (!code) {
      return Response.redirect(`${redirectBase}/admin/instagram?oauth_error=no_code`, 302);
    }

    const appId = Deno.env.get("INSTAGRAM_APP_ID");
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!appId || !appSecret) {
      return Response.redirect(`${redirectBase}/admin/instagram?oauth_error=missing_app_config`, 302);
    }

    // The redirect URI must match exactly what was used in the authorization request
    const redirectUri = `${supabaseUrl}/functions/v1/meta-oauth-callback`;

    // Step 1: Exchange code for short-lived user token
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
    const tokenResp = await fetch(tokenUrl);
    const tokenData = await tokenResp.json();

    if (tokenData.error) {
      console.error("Token exchange error:", JSON.stringify(tokenData.error));
      return Response.redirect(`${redirectBase}/admin/instagram?oauth_error=${encodeURIComponent(tokenData.error.message || "token_exchange_failed")}`, 302);
    }

    const shortLivedToken = tokenData.access_token;
    console.log("✅ Got short-lived user token");

    // Step 2: Exchange for long-lived user token
    const llUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
    const llResp = await fetch(llUrl);
    const llData = await llResp.json();

    if (llData.error) {
      console.error("Long-lived token error:", JSON.stringify(llData.error));
      return Response.redirect(`${redirectBase}/admin/instagram?oauth_error=${encodeURIComponent(llData.error.message || "long_lived_failed")}`, 302);
    }

    const longLivedUserToken = llData.access_token;
    const userTokenExpiresIn = llData.expires_in || 5184000;
    console.log(`✅ Got long-lived user token (expires in ${Math.round(userTokenExpiresIn / 86400)} days)`);

    // Step 3: Get pages to find the Page Access Token
    const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedUserToken}&fields=id,name,access_token,instagram_business_account`;
    const pagesResp = await fetch(pagesUrl);
    const pagesData = await pagesResp.json();

    if (pagesData.error) {
      console.error("Pages fetch error:", JSON.stringify(pagesData.error));
      return Response.redirect(`${redirectBase}/admin/instagram?oauth_error=${encodeURIComponent(pagesData.error.message || "pages_fetch_failed")}`, 302);
    }

    const pages = pagesData.data || [];
    console.log(`Found ${pages.length} pages:`, pages.map((p: any) => p.name));

    if (pages.length === 0) {
      return Response.redirect(`${redirectBase}/admin/instagram?oauth_error=${encodeURIComponent("Nenhuma página encontrada. Verifique se sua conta tem uma Página do Facebook vinculada.")}`, 302);
    }

    // Find page with Instagram Business Account, or use first page
    let selectedPage = pages.find((p: any) => p.instagram_business_account) || pages[0];
    const pageAccessToken = selectedPage.access_token;
    const igAccountId = selectedPage.instagram_business_account?.id || null;

    console.log(`✅ Selected page: ${selectedPage.name}, IG account: ${igAccountId}`);

    // Page tokens obtained via long-lived user tokens are also long-lived (never expire)
    // But we set a far-future expiry for tracking purposes
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year

    // Step 4: Store in DB
    const supabase = createClient(supabaseUrl, supabaseKey);

    const updateData: Record<string, any> = {
      meta_access_token: pageAccessToken,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };

    if (igAccountId) {
      updateData.ig_account_id = igAccountId;
    }

    const { error: dbError } = await supabase
      .from("instagram_config")
      .update(updateData)
      .eq("id", 1);

    if (dbError) {
      console.error("DB update error:", dbError);
      return Response.redirect(`${redirectBase}/admin/instagram?oauth_error=${encodeURIComponent("Erro ao salvar token no banco")}`, 302);
    }

    console.log("✅ Page token saved to instagram_config");

    return Response.redirect(`${redirectBase}/admin/instagram?oauth_success=true&page=${encodeURIComponent(selectedPage.name)}`, 302);
  } catch (err) {
    console.error("Meta OAuth callback error:", err);
    return Response.redirect(`https://aura-mind-guide-01.lovable.app/admin/instagram?oauth_error=${encodeURIComponent(err.message || "unknown_error")}`, 302);
  }
});