import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { sendProactive } from "../_shared/whatsapp-provider.ts";
import { getInstanceConfigForUser, antiBurstDelayForInstance, groupByInstance } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para obter horário de Brasília (UTC-3)
function getBrasiliaTimeString(date: Date = new Date()): string {
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function getBrtHour(): number {
  return (new Date().getUTCHours() - 3 + 24) % 24;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body for force flag
    let force = false;
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch { /* no body is fine */ }

    // Quiet hours guard: no messages between 22h and 8h BRT
    const brtHour = getBrtHour();
    if (!force && (brtHour < 8 || brtHour >= 22)) {
      console.log(`🌙 Quiet hours (${brtHour}h BRT) - skipping periodic content`);
      return new Response(JSON.stringify({ status: 'skipped', reason: 'quiet_hours', brt_hour: brtHour }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🚀 Starting periodic content delivery (Manifesto System)');
    console.log(`🇧🇷 Horário de Brasília: ${getBrasiliaTimeString()}`);

    // =========================================================================
    // FALLBACK: Auto-assign journey for users who didn't choose in 48h
    // =========================================================================
    const fallbackThreshold = new Date();
    fallbackThreshold.setTime(fallbackThreshold.getTime() - (48 * 60 * 60 * 1000));

    // BUG FIX: also include profiles with last_content_sent_at IS NULL (newly onboarded
    // users who never received content). The previous `.lte(...)` filter dropped NULLs
    // because `NULL <= timestamp` evaluates to NULL in Postgres, not true.
    // Guard: only fallback for profiles older than 24h (avoids assigning a journey
    // before the welcome flow completes).
    const minProfileAge = new Date();
    minProfileAge.setTime(minProfileAge.getTime() - (24 * 60 * 60 * 1000));

    const { data: pendingUsers } = await supabase
      .from('profiles')
      .select('id, user_id, name, journeys_completed, last_content_sent_at, created_at')
      .in('status', ['active', 'trial'])
      .is('current_journey_id', null)
      .not('phone', 'is', null)
      .lte('created_at', minProfileAge.toISOString())
      .or(`last_content_sent_at.is.null,last_content_sent_at.lte.${fallbackThreshold.toISOString()}`);

    if (pendingUsers && pendingUsers.length > 0) {
      console.log(`⏰ Found ${pendingUsers.length} users pending journey choice (48h+ elapsed)`);

      // Get all active journeys to pick a default
      const { data: allJourneys } = await supabase
        .from('content_journeys')
        .select('id, title, next_journey_id')
        .eq('is_active', true)
        .order('id');

      for (const pu of pendingUsers) {
        // Pick first available journey as fallback
        const fallbackJourney = allJourneys?.[0];
        if (fallbackJourney) {
          await supabase
            .from('profiles')
            .update({
              current_journey_id: fallbackJourney.id,
              current_episode: 0,
              last_content_sent_at: null, // allow immediate content
            })
            .eq('id', pu.id);
          console.log(`🔄 Auto-assigned ${pu.name || 'user'} to journey: ${fallbackJourney.title}`);
        }
      }
    }

    // =========================================================================

    const eligibilityThreshold = new Date();
    eligibilityThreshold.setTime(eligibilityThreshold.getTime() - (2.5 * 24 * 60 * 60 * 1000));

    console.log(`📅 Threshold de elegibilidade: ${eligibilityThreshold.toISOString()} (${getBrasiliaTimeString(eligibilityThreshold)} BR)`);

    const { data: eligibleUsers, error: usersError } = await supabase
      .from('profiles')
      .select('*')
      .in('status', ['active', 'trial'])
      .not('current_journey_id', 'is', null)
      .not('phone', 'is', null)
      .or(`last_content_sent_at.is.null,last_content_sent_at.lte.${eligibilityThreshold.toISOString()}`);

    if (usersError) {
      console.error('❌ Error fetching eligible users:', usersError);
      throw usersError;
    }

    console.log(`📋 Found ${eligibleUsers?.length || 0} eligible users`);

    if (!eligibleUsers || eligibleUsers.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No eligible users found',
        processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let successCount = 0;
    let errorCount = 0;

    // Group by WhatsApp instance for parallel processing
    const instanceGroups = groupByInstance(eligibleUsers);

    await Promise.all(
      Array.from(instanceGroups.entries()).map(async ([instanceId, groupUsers]) => {
        for (const user of groupUsers) {
          try {
            // Auto-silence removed: active/trial users always receive journey content

            // Skip if do_not_disturb is active
            if (user.do_not_disturb_until && new Date(user.do_not_disturb_until) > new Date()) {
              console.log(`🔇 Skipping user ${user.name || 'Unknown'} - do not disturb until ${user.do_not_disturb_until}`);
              continue;
            }

            console.log(`\n👤 Processing user: ${user.name || 'Unknown'} (episode ${user.current_episode || 0}, last_content: ${user.last_content_sent_at ? getBrasiliaTimeString(new Date(user.last_content_sent_at)) : 'never'} BR)`);

            const currentEpisode = (user.current_episode || 0) + 1;

            const { data: episode, error: episodeError } = await supabase
              .from('journey_episodes')
              .select('*, content_journeys(*)')
              .eq('journey_id', user.current_journey_id)
              .eq('episode_number', currentEpisode)
              .single();

            // Get instance config for this user
            const zapiConfig = await getInstanceConfigForUser(supabase, user.user_id);

            if (episodeError || !episode) {
              console.log(`⚠️ Episode ${currentEpisode} not found for journey ${user.current_journey_id} — skipping`);
              await antiBurstDelayForInstance(instanceId);
              continue;
            }

            // Chamar a função de geração de manifesto
            console.log(`📝 Calling generate-episode-manifesto for episode ${currentEpisode}`);

            const { data: manifestoResult, error: manifestoError } = await supabase.functions.invoke(
              'generate-episode-manifesto',
              {
                body: {
                  user_id: user.user_id,
                  episode_id: episode.id,
                  generate_teaser: true
                }
              }
            );

            if (manifestoError || !manifestoResult?.success) {
              console.error(`❌ Manifesto generation failed:`, manifestoError || manifestoResult?.error);
              errorCount++;
              await antiBurstDelayForInstance(instanceId);
              continue;
            }

            const message = manifestoResult.message;
            const teaser = manifestoResult.teaser as string | undefined;

            // Save TEASER (com link curto para o episódio) como pending_insight.
            // Quando a janela de 24h estiver fechada, o template `jornada_disponivel`
            // é enviado; ao clicar no botão "Acessar", o fast-path do aura-agent
            // entrega APENAS o teaser+link — o conteúdo completo está no /episodio/{id}.
            // Fallback para `message` apenas se o teaser não foi gerado.
            const pendingPayload = teaser && teaser.trim().length > 0 ? teaser : message;
            try {
              await supabase.from('profiles').update({
                pending_insight: `[CONTENT]${pendingPayload}`,
              }).eq('user_id', user.user_id);
            } catch (e) {
              console.warn('⚠️ Could not save pending_insight [CONTENT]:', e);
            }

            const cleanPhone = cleanPhoneNumber(user.phone);
            const sendResult = await sendProactive(
              cleanPhone,
              message,
              'content',
              user.user_id,
              zapiConfig,
              manifestoResult.teaser || undefined
            );

            if (sendResult.success) {
              console.log(`✅ Manifesto sent to ${user.name?.split(' ')[0] || 'user'}`);
              
              // Check if this was the LAST episode of the journey
              const journeyData = episode.content_journeys;
              const isLastEpisode = journeyData && currentEpisode >= journeyData.total_episodes;

              if (isLastEpisode) {
                console.log(`🎉 Last episode — updating profile (journey complete). Choice via episode page.`);
                // Record journey completion in history
                await supabase
                  .from('user_journey_history')
                  .insert({
                    user_id: user.user_id,
                    journey_id: user.current_journey_id,
                  });
                console.log(`📜 Recorded journey ${user.current_journey_id} in history for ${user.name || 'user'}`);
                // No separate completion message — the episode page includes parabéns + journey choice
                await supabase
                  .from('profiles')
                  .update({
                    current_journey_id: null,
                    current_episode: 0,
                    journeys_completed: (user.journeys_completed || 0) + 1,
                    last_content_sent_at: new Date().toISOString()
                  })
                  .eq('id', user.id);
              } else {
                await supabase
                  .from('profiles')
                  .update({
                    current_episode: currentEpisode,
                    last_content_sent_at: new Date().toISOString()
                  })
                  .eq('id', user.id);
              }

              await supabase
                .from('messages')
                .insert({
                  user_id: user.user_id,
                  role: 'assistant',
                  content: message
                });

              successCount++;
            } else {
              console.error(`❌ Failed to send to ${user.name}:`, sendResult.error);
              errorCount++;
            }

            // Per-instance anti-burst delay
            await antiBurstDelayForInstance(instanceId);

          } catch (userError) {
            console.error(`❌ Error processing user ${user.id}:`, userError);
            errorCount++;
          }
        }
      })
    );

    console.log(`\n📊 Summary: ${successCount} sent, ${errorCount} errors`);

    return new Response(JSON.stringify({ 
      success: true,
      processed: eligibleUsers.length,
      sent: successCount,
      errors: errorCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Periodic content error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
