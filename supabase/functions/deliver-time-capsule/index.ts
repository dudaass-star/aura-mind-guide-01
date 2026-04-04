import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendProactive } from "../_shared/whatsapp-provider.ts";
import { getInstanceConfigForUser } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getBrtHour(): number {
  return (new Date().getUTCHours() - 3 + 24) % 24;
}

async function getOrCreatePortalToken(supabase: any, userId: string): Promise<string | null> {
  try {
    const { data: existing } = await supabase
      .from('user_portal_tokens')
      .select('token')
      .eq('user_id', userId)
      .maybeSingle();
    if (existing?.token) return existing.token;

    const { data: created } = await supabase
      .from('user_portal_tokens')
      .upsert({ user_id: userId }, { onConflict: 'user_id' })
      .select('token')
      .single();
    return created?.token || null;
  } catch {
    return null;
  }
}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Quiet hours guard
    const brtHour = getBrtHour();
    if (brtHour < 8 || brtHour >= 22) {
      console.log(`🌙 Quiet hours (${brtHour}h BRT) - skipping time capsule delivery`);
      return new Response(JSON.stringify({ status: 'skipped', reason: 'quiet_hours', brt_hour: brtHour }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('📦 [deliver-time-capsule] Checking for capsules to deliver...');

    const { data: capsules, error } = await supabase
      .from('time_capsules')
      .select('*, profiles!inner(phone, name, user_id, status, whatsapp_instance_id)')
      .eq('delivered', false)
      .lte('deliver_at', new Date().toISOString())
      .limit(20);

    if (error) {
      console.error('❌ Error fetching capsules:', error);
      throw error;
    }

    if (!capsules || capsules.length === 0) {
      console.log('✅ No capsules to deliver');
      return new Response(JSON.stringify({ delivered: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📬 Found ${capsules.length} capsules to deliver`);
    let delivered = 0;

    for (const capsule of capsules) {
      const profile = capsule.profiles;
      if (!profile?.phone || profile.status === 'inactive') {
        console.log(`⏭️ Skipping capsule ${capsule.id} - no phone or inactive user`);
        continue;
      }

      try {
        const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
        const userName = profile.name || 'você';

        // Get portal link
        const portalToken = await getOrCreatePortalToken(supabase, profile.user_id);
        const portalUrl = portalToken
          ? `https://olaaura.com.br/meu-espaco?t=${portalToken}&tab=capsulas`
          : 'https://olaaura.com.br';
        const shortLink = await createShortLink(supabaseUrl, supabaseServiceKey, portalUrl, profile.phone) || portalUrl;

        // Send teaser + link instead of direct audio
        const teaserMsg = `${userName}, lembra daquela cápsula do tempo que você gravou? 💜✨\n\nChegou a hora de ouvir! Escuta com carinho 🫶\n\n${shortLink}\n\n— Aura`;
        
        const result = await sendProactive(profile.phone, teaserMsg, 'checkin', profile.user_id);

        if (result.success) {
          // Mark as delivered
          await supabase.from('time_capsules').update({
            delivered: true,
            delivered_at: new Date().toISOString(),
          }).eq('id', capsule.id);

          // Save to message history
          await supabase.from('messages').insert({
            user_id: profile.user_id,
            role: 'assistant',
            content: teaserMsg,
          });

          delivered++;
          console.log(`✅ Capsule ${capsule.id} teaser sent to ${profile.phone.substring(0, 4)}***`);
        } else {
          console.error(`❌ Failed to send capsule teaser for ${capsule.id}:`, result.error);
        }

        // Short delay between sends
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (err) {
        console.error(`❌ Error delivering capsule ${capsule.id}:`, err);
      }
    }

    console.log(`📦 Delivery complete: ${delivered}/${capsules.length} capsules delivered`);

    return new Response(JSON.stringify({ delivered, total: capsules.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ deliver-time-capsule error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
