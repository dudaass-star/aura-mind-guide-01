import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle webhook verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken = Deno.env.get("INSTAGRAM_VERIFY_TOKEN") || "aura_ig_verify_2026";

    if (mode === "subscribe" && token === verifyToken) {
      console.log("Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Validate Meta signature
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET");
    if (!appSecret) {
      console.error("INSTAGRAM_APP_SECRET not configured");
      return new Response("OK", { status: 200 }); // Always 200 to Meta
    }

    const bodyText = await req.text();
    const signature = req.headers.get("x-hub-signature-256");

    if (signature) {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(appSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(bodyText));
      const expectedSig = "sha256=" + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");

      if (signature !== expectedSig) {
        console.warn(`⚠️ Signature mismatch - received: ${signature.slice(0, 17)}... expected: ${expectedSig.slice(0, 17)}... (continuing anyway for debug)`);
        // TODO: restore strict validation after confirming correct secret
        // return new Response("OK", { status: 200 });
      } else {
        console.log("✅ Webhook signature verified");
      }
    }

    const body = JSON.parse(bodyText);
    console.log("Instagram webhook received:", JSON.stringify(body).slice(0, 500));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if responses are enabled
    const { data: config } = await supabase
      .from("instagram_config")
      .select("*")
      .eq("id", 1)
      .single();

    if (!config?.response_enabled) {
      console.log("Instagram responses disabled");
      return new Response("OK", { status: 200 });
    }

    // Warn if token is about to expire
    if (config.token_expires_at) {
      const daysLeft = (new Date(config.token_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysLeft < 3) {
        console.warn(`⚠️ META_ACCESS_TOKEN expires in ${Math.round(daysLeft)} days!`);
      }
    }

    // Reset daily count if new day
    const today = new Date().toISOString().split("T")[0];
    if (config.last_reset_date !== today) {
      await supabase
        .from("instagram_config")
        .update({ daily_count: 0, last_reset_date: today })
        .eq("id", 1);
      config.daily_count = 0;
    }

    // Check daily limit
    if (config.daily_count >= config.max_daily_responses) {
      console.log("Daily response limit reached:", config.daily_count);
      return new Response("OK", { status: 200 });
    }

    // Process entries
    if (!body.entry) {
      return new Response("OK", { status: 200 });
    }

    const igAccountId = config.ig_account_id || Deno.env.get("INSTAGRAM_ACCOUNT_ID");

    for (const entry of body.entry) {
      // Process comments
      if (entry.changes && config.comment_response_enabled) {
        for (const change of entry.changes) {
          if (change.field === "comments" && change.value) {
            const val = change.value;
            
            // Skip own comments
            if (val.from?.id === igAccountId) continue;

            const interaction = {
              ig_user_id: val.from?.id || "unknown",
              ig_username: val.from?.username || null,
              interaction_type: "comment",
              original_text: val.text || "",
              post_id: val.media?.id || null,
              comment_id: val.id || null,
            };

            // Call instagram-agent
            try {
              const agentResp = await supabase.functions.invoke("instagram-agent", {
                body: { interaction, config }
              });

              if (agentResp.data?.response_text) {
                await supabase.from("instagram_interactions").insert({
                  ...interaction,
                  response_text: agentResp.data.response_text,
                  sentiment: agentResp.data.sentiment,
                  responded: true,
                });

                // Increment daily count
                await supabase
                  .from("instagram_config")
                  .update({ daily_count: (config.daily_count || 0) + 1 })
                  .eq("id", 1);
              } else {
                await supabase.from("instagram_interactions").insert({
                  ...interaction,
                  responded: false,
                  error_message: agentResp.data?.error || "No response generated",
                  sentiment: agentResp.data?.sentiment || null,
                });
              }
            } catch (err) {
              console.error("Error calling instagram-agent for comment:", err);
              await supabase.from("instagram_interactions").insert({
                ...interaction,
                responded: false,
                error_message: err.message,
              });
            }
          }
        }
      }

      // Process DMs (messaging)
      if (entry.messaging && config.dm_response_enabled) {
        for (const msg of entry.messaging) {
          if (!msg.message?.text) continue;
          // Skip echo messages (sent by page)
          if (msg.message?.is_echo) continue;

          const senderId = msg.sender?.id;
          if (senderId === igAccountId) continue;

          const interaction = {
            ig_user_id: senderId || "unknown",
            ig_username: null,
            interaction_type: "dm",
            original_text: msg.message.text,
            post_id: null,
            comment_id: null,
          };

          try {
            const agentResp = await supabase.functions.invoke("instagram-agent", {
              body: { interaction, config }
            });

            if (agentResp.data?.response_text) {
              await supabase.from("instagram_interactions").insert({
                ...interaction,
                response_text: agentResp.data.response_text,
                sentiment: agentResp.data.sentiment,
                responded: true,
              });

              await supabase
                .from("instagram_config")
                .update({ daily_count: (config.daily_count || 0) + 1 })
                .eq("id", 1);
            } else {
              await supabase.from("instagram_interactions").insert({
                ...interaction,
                responded: false,
                error_message: agentResp.data?.error || "No response generated",
                sentiment: agentResp.data?.sentiment || null,
              });
            }
          } catch (err) {
            console.error("Error calling instagram-agent for DM:", err);
            await supabase.from("instagram_interactions").insert({
              ...interaction,
              responded: false,
              error_message: err.message,
            });
          }
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("OK", { status: 200 }); // Always 200 to Meta
  }
});
