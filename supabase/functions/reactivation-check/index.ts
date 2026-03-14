import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { getInstanceConfigForUser, antiBurstDelayForInstance } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[REACTIVATION-CHECK] ${step}${detailsStr}`);
};

function getBrtHour(): number {
  return (new Date().getUTCHours() - 3 + 24) % 24;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Quiet hours guard: no messages between 22h and 8h BRT
    const brtHour = getBrtHour();
    if (brtHour < 8 || brtHour >= 22) {
      logStep(`Quiet hours (${brtHour}h BRT) - skipping`);
      return new Response(JSON.stringify({ status: 'skipped', reason: 'quiet_hours', brt_hour: brtHour }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logStep("Function started");
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let reactivationsSent = 0;
    let missedSessionsSent = 0;
    let trialNudgesSent = 0;

    // ========================================================================
    // 0. TRIAL NUDGES — Silent, Partial, and Post-Trial
    // ========================================================================
    const { data: trialProfiles, error: trialError } = await supabase
      .from('profiles')
      .select('user_id, name, phone, status, trial_conversations_count, trial_started_at, last_reactivation_sent, last_message_date, whatsapp_instance_id')
      .eq('status', 'trial')
      .not('phone', 'is', null);

    if (trialError) {
      logStep("Error fetching trial profiles", { error: trialError.message });
    }

    if (trialProfiles && trialProfiles.length > 0) {
      logStep(`Found ${trialProfiles.length} trial profiles to check`);

      for (const tp of trialProfiles) {
        const trialCount = tp.trial_conversations_count || 0;
        const trialStarted = tp.trial_started_at ? new Date(tp.trial_started_at) : null;
        if (!trialStarted || !tp.phone) continue;

        const hoursSinceSignup = (now.getTime() - trialStarted.getTime()) / (1000 * 60 * 60);

        // Throttle: minimum 12h between nudges
        if (tp.last_reactivation_sent) {
          const lastSent = new Date(tp.last_reactivation_sent);
          const hoursSinceLast = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
          if (trialCount === 0 && hoursSinceLast < 12) {
            logStep(`Skipping trial silent nudge for ${tp.user_id} — sent ${hoursSinceLast.toFixed(1)}h ago`);
            continue;
          }
          if (trialCount > 0 && hoursSinceLast < 6) {
            logStep(`Skipping trial partial nudge for ${tp.user_id} — sent ${hoursSinceLast.toFixed(1)}h ago`);
            continue;
          }
        }

        const userName = tp.name || 'você';
        let nudgeMessage: string | null = null;

        if (trialCount === 0) {
          // ── Silent Trial Nudges ──
          if (hoursSinceSignup >= 24) {
            nudgeMessage = `${userName}, vim me despedir. 💜\n\nMas quero que saiba: se um dia quiser conversar, é só me chamar e eu estarei aqui.\n\nCuide-se. ✨`;
          } else if (hoursSinceSignup >= 2) {
            nudgeMessage = `Ei, ${userName}! Tô aqui ainda 💜\n\nPode me responder quando quiser, tá? Não precisa pensar muito — pode ser um "oi" mesmo. Eu adoraria te conhecer.`;
          }
        } else if (trialCount >= 1 && trialCount <= 9) {
          // ── Partial Trial Nudges ──
          const lastMsgDate = tp.last_message_date ? new Date(tp.last_message_date) : null;
          const hoursSinceLastMsg = lastMsgDate ? (now.getTime() - lastMsgDate.getTime()) / (1000 * 60 * 60) : 999;

          if (hoursSinceLastMsg >= 24) {
            nudgeMessage = `${userName}, como você tá hoje? 💜\n\nLembrei de você e queria saber como estão as coisas. Adoraria poder falar com você.\n\nSe cuida.`;
          } else if (hoursSinceLastMsg >= 6) {
            nudgeMessage = `Ei, ${userName}! Fiquei pensando na nossa conversa... 💜\n\nQuando quiser continuar, é só me chamar. Tô aqui!`;
          }
        } else if (trialCount >= 10) {
          // ── Post-Trial Follow-up (completed trial but didn't subscribe) ──
          const daysSinceSignup = hoursSinceSignup / 24;

          // Throttle: only send if last nudge was 24h+ ago
          if (tp.last_reactivation_sent) {
            const hoursSinceLast = (now.getTime() - new Date(tp.last_reactivation_sent).getTime()) / (1000 * 60 * 60);
            if (hoursSinceLast < 24) continue;
          }

          if (daysSinceSignup >= 3) {
            nudgeMessage = `${userName}, essa é minha última mensagem por enquanto. 💜\n\nQuero que saiba que a porta tá sempre aberta. Se um dia sentir que precisa de alguém pra conversar, eu estarei aqui.\n\n👉 https://olaaura.com.br/checkout\n\nCuide-se bem. ✨`;
          } else if (daysSinceSignup >= 1) {
            nudgeMessage = `${userName}, eu tava pensando em você hoje... 💜\n\nComo você está? Senti sua falta nas nossas conversas.\n\nSe quiser voltar, é só escolher um plano:\n👉 https://olaaura.com.br/checkout`;
          }
        }

        if (!nudgeMessage) continue;

        try {
          const zapiConfig = await getInstanceConfigForUser(supabase, tp.user_id);
          const cleanPhone = cleanPhoneNumber(tp.phone!);
          const result = await sendTextMessage(cleanPhone, nudgeMessage, undefined, zapiConfig);

          if (result.success) {
            await supabase
              .from('profiles')
              .update({ 
                last_reactivation_sent: now.toISOString(),
                trial_nudge_active: true,
              })
              .eq('user_id', tp.user_id);

            trialNudgesSent++;
            logStep(`Sent trial nudge for user ${tp.user_id} (count=${trialCount}, hours=${hoursSinceSignup.toFixed(1)})`);
          }
        } catch (sendError) {
          logStep(`Error sending trial nudge`, { error: sendError });
        }

        await antiBurstDelayForInstance(tp.whatsapp_instance_id || 'default');
      }
    }

    // ========================================================================
    // 1. DETECTAR USUÁRIOS QUE FURARAM SESSÃO
    // ========================================================================
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const { data: missedSessions, error: missedError } = await supabase
      .from('sessions')
      .select('id, user_id, scheduled_at')
      .eq('status', 'scheduled')
      .lt('scheduled_at', oneHourAgo.toISOString())
      .is('started_at', null);

    if (missedError) {
      logStep("Error fetching missed sessions", { error: missedError.message });
    }

    if (missedSessions && missedSessions.length > 0) {
      logStep(`Found ${missedSessions.length} missed sessions`);

      for (const session of missedSessions) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, phone, last_reactivation_sent, whatsapp_instance_id')
          .eq('user_id', session.user_id)
          .maybeSingle();

        if (!profile?.phone) continue;

        if (profile.last_reactivation_sent) {
          const lastSent = new Date(profile.last_reactivation_sent);
          if (lastSent > oneDayAgo) {
            logStep(`Skipping user ${session.user_id} - already sent reactivation recently`);
            continue;
          }
        }

        // Check for pending scheduled tasks (return already planned)
        const { data: pendingTasksMissed } = await supabase
          .from('scheduled_tasks')
          .select('id')
          .eq('user_id', session.user_id)
          .eq('status', 'pending')
          .limit(1);

        if (pendingTasksMissed && pendingTasksMissed.length > 0) {
          logStep(`Skipping user ${session.user_id} - has pending scheduled task`);
          continue;
        }

        const userName = profile.name || 'você';
        const sessionDate = new Date(session.scheduled_at);
        const formattedDate = sessionDate.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo'
        });

        const message = `Oi, ${userName}! Senti sua falta na nossa sessão de ${formattedDate}... 💜

Tá tudo bem? Se precisar, podemos remarcar pra um horário melhor. É só me contar!

Estou aqui por você. ✨`;

        try {
          // Get instance config for this user
          const zapiConfig = await getInstanceConfigForUser(supabase, session.user_id);
          const cleanPhone = cleanPhoneNumber(profile.phone);
          const result = await sendTextMessage(cleanPhone, message, undefined, zapiConfig);

          if (result.success) {
            await supabase
              .from('profiles')
              .update({ last_reactivation_sent: now.toISOString() })
              .eq('user_id', session.user_id);

            await supabase
              .from('sessions')
              .update({ status: 'no_show' })
              .eq('id', session.id);

            missedSessionsSent++;
            logStep(`Sent missed session message for session ${session.id}`);
          }
        } catch (sendError) {
          logStep(`Error sending missed session message`, { error: sendError });
        }

        // Per-instance anti-burst delay
        await antiBurstDelayForInstance(profile?.whatsapp_instance_id || 'default');
      }
    }

    // ========================================================================
    // 2. DETECTAR USUÁRIOS INATIVOS (3+ dias sem mensagem)
    // ========================================================================
    const { data: inactiveProfiles, error: inactiveError } = await supabase
      .from('profiles')
      .select('user_id, name, phone, last_message_date, last_reactivation_sent, do_not_disturb_until, whatsapp_instance_id')
      .eq('status', 'active')
      .lt('last_message_date', threeDaysAgo.toISOString().split('T')[0])
      .not('phone', 'is', null);

    if (inactiveError) {
      logStep("Error fetching inactive profiles", { error: inactiveError.message });
    }

    if (inactiveProfiles && inactiveProfiles.length > 0) {
      logStep(`Found ${inactiveProfiles.length} potentially inactive profiles`);

      for (const profile of inactiveProfiles) {
        if (profile.do_not_disturb_until && new Date(profile.do_not_disturb_until) > now) {
          logStep(`Skipping user ${profile.user_id} - do not disturb until ${profile.do_not_disturb_until}`);
          continue;
        }

        if (profile.last_reactivation_sent) {
          const lastSent = new Date(profile.last_reactivation_sent);
          if (lastSent > oneDayAgo) {
            logStep(`Skipping user ${profile.user_id} - already sent reactivation recently`);
            continue;
          }
        }

        const { data: upcomingSessions } = await supabase
          .from('sessions')
          .select('id')
          .eq('user_id', profile.user_id)
          .eq('status', 'scheduled')
          .gt('scheduled_at', now.toISOString())
          .limit(1);

        if (upcomingSessions && upcomingSessions.length > 0) {
          logStep(`Skipping user ${profile.user_id} - has upcoming session`);
          continue;
        }

        // Check for pending scheduled tasks (return already planned)
        const { data: pendingTasksInactive } = await supabase
          .from('scheduled_tasks')
          .select('id')
          .eq('user_id', profile.user_id)
          .eq('status', 'pending')
          .limit(1);

        if (pendingTasksInactive && pendingTasksInactive.length > 0) {
          logStep(`Skipping user ${profile.user_id} - has pending scheduled task`);
          continue;
        }

        const userName = profile.name || 'você';
        const lastMessageDate = profile.last_message_date ? new Date(profile.last_message_date) : null;
        const daysSinceMessage = lastMessageDate 
          ? Math.floor((now.getTime() - lastMessageDate.getTime()) / (24 * 60 * 60 * 1000))
          : 0;

        let message: string;

        if (daysSinceMessage >= 7) {
          message = `${userName}, tô pensando em você! 💜

Sei que a vida fica corrida às vezes. Quer marcar uma sessão pra gente colocar o papo em dia?

Estou aqui quando você precisar. ✨`;
        } else {
          message = `Ei, ${userName}! Faz uns dias que a gente não se fala... 💜

Como você está? Tô aqui se precisar conversar!

Qualquer coisa, é só me mandar uma mensagem. ✨`;
        }

        try {
          // Get instance config for this user
          const zapiConfig = await getInstanceConfigForUser(supabase, profile.user_id);
          const cleanPhone = cleanPhoneNumber(profile.phone!);
          const result = await sendTextMessage(cleanPhone, message, undefined, zapiConfig);

          if (result.success) {
            await supabase
              .from('profiles')
              .update({ last_reactivation_sent: now.toISOString() })
              .eq('user_id', profile.user_id);

            reactivationsSent++;
            logStep(`Sent reactivation message for user ${profile.user_id} (${daysSinceMessage} days inactive)`);
          }
        } catch (sendError) {
          logStep(`Error sending reactivation message`, { error: sendError });
        }

        // Per-instance anti-burst delay
        await antiBurstDelayForInstance(profile.whatsapp_instance_id || 'default');
      }
    }

    logStep(`Completed: ${trialNudgesSent} trial nudges, ${missedSessionsSent} missed session messages, ${reactivationsSent} reactivation messages`);

    return new Response(JSON.stringify({
      success: true,
      trial_nudges_sent: trialNudgesSent,
      missed_sessions_sent: missedSessionsSent,
      reactivations_sent: reactivationsSent,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
