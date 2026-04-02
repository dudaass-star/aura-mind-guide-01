import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { sendMessage, sendProactive } from "../_shared/whatsapp-provider.ts";
import { getInstanceConfigForUser, antiBurstDelayForInstance, groupByInstance } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getCheckinMessage(profile: any): string {
  const name = profile.name?.split(' ')[0] || 'você';
  const hour = new Date().getHours();

  let greeting = '';
  if (hour < 12) greeting = 'Bom dia';
  else if (hour < 18) greeting = 'Boa tarde';
  else greeting = 'Boa noite';

  const messages = [
    `${greeting}, ${name}! 🌟\n\nFaz um tempinho que a gente não se fala... como você está? Estou aqui pra te ouvir.`,
    `${greeting}, ${name}! 💫\n\nPassei pra saber como você está. Tem algo na sua mente? Adoraria conversar com você.`,
    `${greeting}, ${name}! 🌸\n\nEstou aqui pensando em você. Como estão as coisas? Posso te ajudar com algo?`,
    `${greeting}, ${name}! ✨\n\nSenti sua falta! Como você está se sentindo? Vamos conversar?`,
  ];

  return messages[Math.floor(Math.random() * messages.length)];
}

function getBrtHour(): number {
  return (new Date().getUTCHours() - 3 + 24) % 24;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const brtHour = getBrtHour();
    if (brtHour < 8 || brtHour >= 22) {
      console.log(`🌙 Quiet hours (${brtHour}h BRT) - skipping scheduled check-in`);
      return new Response(JSON.stringify({ status: 'skipped', reason: 'quiet_hours', brt_hour: brtHour }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let dryRun = false;
    let targetUserId: string | null = null;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
      targetUserId = body?.target_user_id || null;
    } catch { /* no body */ }

    console.log(`🕐 Starting monthly check-in... (dry_run=${dryRun})`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Query: active users, 7+ days without message, no check-in in last 30 days
    let profilesQuery = supabase
      .from('profiles')
      .select('*')
      .eq('status', 'active')
      .not('phone', 'is', null)
      .lt('last_message_date', sevenDaysAgo.toISOString().split('T')[0]);

    if (targetUserId) {
      profilesQuery = profilesQuery.eq('user_id', targetUserId);
    } else {
      profilesQuery = profilesQuery
        .or('do_not_disturb_until.is.null,do_not_disturb_until.lte.' + now.toISOString())
        .or('last_checkin_sent_at.is.null,last_checkin_sent_at.lte.' + thirtyDaysAgo.toISOString());
    }

    const { data: profiles, error: profilesError } = await profilesQuery;

    if (profilesError) {
      throw new Error(`Error fetching profiles: ${profilesError.message}`);
    }

    console.log(`📋 Found ${profiles?.length || 0} eligible users (7+ days inactive, no check-in in 30 days)`);

    let sentCount = 0;
    const dryRunResults: any[] = [];

    const instanceGroups = groupByInstance(profiles || []);

    await Promise.all(
      Array.from(instanceGroups.entries()).map(async ([instanceId, groupProfiles]) => {
        for (const profile of groupProfiles) {
          try {
            const message = getCheckinMessage(profile);

            if (dryRun) {
              dryRunResults.push({
                user_id: profile.user_id,
                name: profile.name,
                last_message_date: profile.last_message_date,
                last_checkin_sent_at: profile.last_checkin_sent_at,
                message,
              });
              sentCount++;
              continue;
            }

            const zapiConfig = await getInstanceConfigForUser(supabase, profile.user_id);
            const cleanPhone = cleanPhoneNumber(profile.phone);
            const result = await sendProactive(cleanPhone, message, 'checkin', profile.user_id);

            if (result.success) {
              console.log(`✅ Check-in sent to ${profile.name} (${profile.phone})`);
              sentCount++;

              await Promise.all([
                supabase.from('messages').insert({
                  user_id: profile.user_id,
                  role: 'assistant',
                  content: message,
                }),
                supabase.from('profiles').update({
                  last_checkin_sent_at: now.toISOString(),
                }).eq('user_id', profile.user_id),
              ]);
            } else {
              console.error(`❌ Failed to send to ${profile.phone}: ${result.error}`);
            }

            await antiBurstDelayForInstance(instanceId);
          } catch (userError) {
            console.error(`❌ Error processing user ${profile.user_id}:`, userError);
          }
        }
      })
    );

    console.log(`📊 Check-in complete: ${sentCount}/${profiles?.length || 0} messages sent`);

    const responsePayload: any = {
      status: 'success',
      totalUsers: profiles?.length || 0,
      messagesSent: sentCount,
    };
    if (dryRun) {
      responsePayload.dry_run = true;
      responsePayload.messages = dryRunResults;
    }

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Scheduled check-in error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
