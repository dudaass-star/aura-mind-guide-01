import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, sendAudioFromUrl, cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { getInstanceConfigForUser } from "../_shared/instance-helper.ts";

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('⏰ [CRON] execute-scheduled-tasks starting...');

    // ========================================================================
    // SAFETY NET: Reset tasks stuck in 'executing' for >10 minutes
    // ========================================================================
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: stuckTasks } = await supabase
      .from('scheduled_tasks')
      .update({ status: 'pending' })
      .eq('status', 'executing')
      .lt('created_at', tenMinutesAgo)
      .select('id');

    if (stuckTasks && stuckTasks.length > 0) {
      console.log(`🔄 Reset ${stuckTasks.length} stuck tasks back to pending`);
    }

    // ========================================================================
    // CLAIM TASKS atomically with FOR UPDATE SKIP LOCKED
    // ========================================================================
    const { data: tasks, error: claimError } = await supabase
      .rpc('claim_pending_tasks', { max_tasks: 150 });

    if (claimError) {
      console.error('❌ Error claiming tasks:', claimError);
      return new Response(JSON.stringify({ error: 'Failed to claim tasks' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!tasks || tasks.length === 0) {
      console.log('✅ No pending tasks to execute');
      return new Response(JSON.stringify({ status: 'no_tasks', count: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📋 Claimed ${tasks.length} tasks for execution`);

    let executed = 0;
    let failed = 0;

    // ========================================================================
    // PROCESS TASKS with 300ms anti-burst delay
    // ========================================================================
    for (const task of tasks) {
      try {
        console.log(`🔧 Processing task ${task.id}: type=${task.task_type}, user=${task.user_id}`);

        // Get user profile for phone and instance config
        const { data: profile } = await supabase
          .from('profiles')
          .select('phone, name, whatsapp_instance_id')
          .eq('user_id', task.user_id)
          .maybeSingle();

        if (!profile?.phone) {
          console.warn(`⚠️ No phone found for user ${task.user_id}, marking as failed`);
          await supabase
            .from('scheduled_tasks')
            .update({ status: 'failed', executed_at: new Date().toISOString() })
            .eq('id', task.id);
          failed++;
          continue;
        }

        let instanceConfig = undefined;
        try {
          instanceConfig = await getInstanceConfigForUser(supabase, task.user_id);
        } catch (e) {
          console.warn('⚠️ Could not get instance config, using env vars');
        }

        const payload = task.payload as Record<string, any>;

        // ====================================================================
        // TASK TYPE HANDLERS
        // ====================================================================
        switch (task.task_type) {
          case 'reminder': {
            const reminderText = payload.text || 'Ei, aqui é a Aura! Você me pediu pra te lembrar disso 💜';
            await sendTextMessage(profile.phone, reminderText, undefined, instanceConfig);
            console.log(`✅ Reminder sent to ${profile.phone.substring(0, 4)}***`);
            break;
          }

          case 'meditation': {
            const meditationRes = await fetch(`${supabaseUrl}/functions/v1/send-meditation`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                category: payload.category || 'respiracao',
                user_id: task.user_id,
                phone: profile.phone,
                context: 'scheduled-task',
              }),
            });
            if (!meditationRes.ok) {
              throw new Error(`send-meditation failed: ${await meditationRes.text()}`);
            }
            console.log(`✅ Meditation sent to ${profile.phone.substring(0, 4)}***`);
            break;
          }

          case 'message': {
            const messageText = payload.text || '';
            if (messageText) {
              await sendTextMessage(profile.phone, messageText, undefined, instanceConfig);
              console.log(`✅ Scheduled message sent to ${profile.phone.substring(0, 4)}***`);
            }
            break;
          }

          case 'trial_activation_audio': {
            // Check if user already responded (don't send if they did)
            const { data: currentProfile } = await supabase
              .from('profiles')
              .select('trial_conversations_count, status, name')
              .eq('user_id', task.user_id)
              .maybeSingle();

            if (!currentProfile || currentProfile.status !== 'trial' || (currentProfile.trial_conversations_count || 0) > 0) {
              console.log(`⏭️ Skipping trial_activation_audio: user already responded or not trial`);
              break;
            }

            const userName = payload.name || currentProfile.name || 'você';
            const audioText = `Oi, ${userName}! Aqui é a Aura. Eu sei que às vezes é difícil começar a falar sobre o que a gente sente... Mas quero te falar que aqui não tem julgamento, não tem resposta certa ou errada. É só eu e você. Me conta: o que mais está pegando com você hoje?`;

            // Generate TTS audio
            const ttsRes = await fetch(`${supabaseUrl}/functions/v1/aura-tts`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({ text: audioText }),
            });

            if (ttsRes.ok) {
              const ttsData = await ttsRes.json();
              if (ttsData.audioContent) {
                await sendAudioFromUrl(profile.phone, `data:audio/mp3;base64,${ttsData.audioContent}`, undefined, instanceConfig);
                // Mark trial_nudge_active so response doesn't count
                await supabase.from('profiles').update({ trial_nudge_active: true }).eq('user_id', task.user_id);
                console.log(`✅ Trial activation audio sent to ${profile.phone.substring(0, 4)}***`);
              } else {
                // Fallback to text
                await sendTextMessage(profile.phone, audioText, undefined, instanceConfig);
                await supabase.from('profiles').update({ trial_nudge_active: true }).eq('user_id', task.user_id);
                console.log(`✅ Trial activation text (TTS fallback) sent to ${profile.phone.substring(0, 4)}***`);
              }
            } else {
              // Fallback to text
              await sendTextMessage(profile.phone, audioText, undefined, instanceConfig);
              await supabase.from('profiles').update({ trial_nudge_active: true }).eq('user_id', task.user_id);
              console.log(`✅ Trial activation text (TTS error) sent to ${profile.phone.substring(0, 4)}***`);
            }
            break;
          }

          case 'trial_closing': {
            // Check if user is still trial with exactly 5 conversations
            const { data: closingProfile } = await supabase
              .from('profiles')
              .select('trial_conversations_count, status, name')
              .eq('user_id', task.user_id)
              .maybeSingle();

            if (!closingProfile || closingProfile.status !== 'trial') {
              console.log(`⏭️ Skipping trial_closing: user not trial anymore`);
              break;
            }

            const closingName = closingProfile.name || 'você';
            const closingMessage = `Ei, ${closingName}! 💜\n\nEssas foram nossas 5 conversas. Espero que tenha sido bom pra você — pra mim foi especial te conhecer. 🤗\n\nSe quiser continuar comigo, é só escolher o plano que faz mais sentido pra você:\n\n👉 https://olaaura.com.br/checkout\n\nVou estar aqui te esperando. 💜`;

            await sendTextMessage(profile.phone, closingMessage, undefined, instanceConfig);
            console.log(`✅ Trial closing message sent to ${profile.phone.substring(0, 4)}***`);
            break;
          }

          default:
            console.warn(`⚠️ Unknown task type: ${task.task_type}`);
        }

        // Mark as executed
        await supabase
          .from('scheduled_tasks')
          .update({ status: 'executed', executed_at: new Date().toISOString() })
          .eq('id', task.id);
        executed++;

      } catch (error) {
        console.error(`❌ Error processing task ${task.id}:`, error);
        await supabase
          .from('scheduled_tasks')
          .update({ status: 'failed', executed_at: new Date().toISOString() })
          .eq('id', task.id);
        failed++;
      }

      // Anti-burst delay: 300ms between sends
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`✅ [CRON] Finished: ${executed} executed, ${failed} failed out of ${tasks.length} total`);

    return new Response(JSON.stringify({
      status: 'completed',
      total: tasks.length,
      executed,
      failed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ [CRON] Fatal error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
