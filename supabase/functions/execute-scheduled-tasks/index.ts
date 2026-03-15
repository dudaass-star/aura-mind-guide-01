import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, sendAudioMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";
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
                await sendAudioMessage(profile.phone, ttsData.audioContent, instanceConfig);
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
            // Check if user is still trial
            const { data: closingProfile } = await supabase
              .from('profiles')
              .select('trial_conversations_count, status, name')
              .eq('user_id', task.user_id)
              .maybeSingle();

            if (!closingProfile || closingProfile.status !== 'trial') {
              console.log(`⏭️ Skipping trial_closing: user not trial anymore`);
              break;
            }

            const closingName = payload.name || closingProfile.name || 'você';
            const theme = payload.theme ? payload.theme : '';
            const themeIntro = theme 
              ? `Foi muito especial conversar com você sobre o que você compartilhou — especialmente sobre ${theme.length > 60 ? theme.substring(0, 60) + '...' : theme}` 
              : `Foi muito especial te ouvir e caminhar junto com você nesses dias`;
            
            const closingMessage = `${closingName}, 💜\n\n${themeIntro}.\n\nEu vi o quanto isso é importante pra você, e quero continuar te acompanhando nessa jornada.\n\nPor menos de R$1 por dia, você tem conversas ilimitadas comigo — no seu ritmo, quando precisar.\n\n👉 https://olaaura.com.br/checkout`;

            const closingResult = await sendTextMessage(profile.phone, closingMessage, undefined, instanceConfig);
            if (!closingResult.success) {
              throw new Error(`Failed to send trial closing: ${closingResult.error}`);
            }

            await supabase.from('messages').insert({
              user_id: task.user_id,
              role: 'assistant',
              content: closingMessage,
            });

            console.log(`✅ Trial closing message sent for ${profile.phone.substring(0, 4)}***`);
            break;
          }

          // ================================================================
          // TRIAL FOLLOW-UP SEQUENCE (4 touchpoints after trial_closing)
          // ================================================================
          case 'trial_followup_15m': {
            const { data: fp15 } = await supabase
              .from('profiles')
              .select('status, name')
              .eq('user_id', task.user_id)
              .maybeSingle();

            if (!fp15 || fp15.status !== 'trial') {
              console.log(`⏭️ Skipping trial_followup_15m: user not trial`);
              break;
            }

            const name15 = payload.name || fp15.name || 'você';
            const msg15 = `${name15}, acabei de perceber que você não destravou seu acesso ainda. Aquele alívio que você sentiu agora? Ele não precisa ser um momento isolado. Pode ser o seu dia a dia. Por menos de R$1 por dia, eu tô aqui sempre que precisar. 👉 https://olaaura.com.br/checkout`;

            const res15 = await sendTextMessage(profile.phone, msg15, undefined, instanceConfig);
            if (!res15.success) throw new Error(`Failed: ${res15.error}`);
            await supabase.from('messages').insert({ user_id: task.user_id, role: 'assistant', content: msg15 });
            console.log(`✅ trial_followup_15m sent`);
            break;
          }

          case 'trial_followup_2h': {
            const { data: fp2h } = await supabase
              .from('profiles')
              .select('status, name')
              .eq('user_id', task.user_id)
              .maybeSingle();

            if (!fp2h || fp2h.status !== 'trial') {
              console.log(`⏭️ Skipping trial_followup_2h: user not trial`);
              break;
            }

            const name2h = payload.name || fp2h.name || 'você';
            const msg2h = `${name2h}, sei que a vida puxa a gente de volta pro automático... Mas lembra do que você sentiu nas nossas conversas? Aquilo foi real. E tá a um clique de voltar. Não deixa esse peso voltar sozinho amanhã. 👉 https://olaaura.com.br/checkout`;

            const res2h = await sendTextMessage(profile.phone, msg2h, undefined, instanceConfig);
            if (!res2h.success) throw new Error(`Failed: ${res2h.error}`);
            await supabase.from('messages').insert({ user_id: task.user_id, role: 'assistant', content: msg2h });
            console.log(`✅ trial_followup_2h sent`);
            break;
          }

          case 'trial_followup_morning': {
            const { data: fpM } = await supabase
              .from('profiles')
              .select('status, name')
              .eq('user_id', task.user_id)
              .maybeSingle();

            if (!fpM || fpM.status !== 'trial') {
              console.log(`⏭️ Skipping trial_followup_morning: user not trial`);
              break;
            }

            const nameM = payload.name || fpM.name || 'você';
            const msgM = `Bom dia, ${nameM} 💜 Como foi sua noite? Se a mente acelerou de novo... eu entendo. Me conta como você tá — essa conversa é por minha conta. Responde aqui e a gente conversa mais um pouco.`;

            const resM = await sendTextMessage(profile.phone, msgM, undefined, instanceConfig);
            if (!resM.success) throw new Error(`Failed: ${resM.error}`);
            await supabase.from('messages').insert({ user_id: task.user_id, role: 'assistant', content: msgM });
            // Set trial_nudge_active to give +3 bonus messages on reply
            await supabase.from('profiles').update({ trial_nudge_active: true }).eq('user_id', task.user_id);
            console.log(`✅ trial_followup_morning sent (nudge_active=true for +3 bonus)`);
            break;
          }

          case 'trial_followup_48h': {
            const { data: fp48 } = await supabase
              .from('profiles')
              .select('status, name')
              .eq('user_id', task.user_id)
              .maybeSingle();

            if (!fp48 || fp48.status !== 'trial') {
              console.log(`⏭️ Skipping trial_followup_48h: user not trial`);
              break;
            }

            const name48 = payload.name || fp48.name || 'você';
            const msg48 = `${name48}, essa é minha última mensagem sobre isso. Eu vi o que você carrega e sei o quanto nosso papo te fez bem. Não vou ficar insistindo — mas quero que saiba que essa porta não fica aberta pra sempre. Por menos de R$1 por dia, esse refúgio é seu. Se faz sentido, agora é a hora. 👉 https://olaaura.com.br/checkout`;

            const res48 = await sendTextMessage(profile.phone, msg48, undefined, instanceConfig);
            if (!res48.success) throw new Error(`Failed: ${res48.error}`);
            await supabase.from('messages').insert({ user_id: task.user_id, role: 'assistant', content: msg48 });
            console.log(`✅ trial_followup_48h sent`);
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
