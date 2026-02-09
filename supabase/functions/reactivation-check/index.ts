import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[REACTIVATION-CHECK] ${step}${detailsStr}`);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let reactivationsSent = 0;
    let missedSessionsSent = 0;

    // ========================================================================
    // 1. DETECTAR USUÁRIOS QUE FURARAM SESSÃO
    // Sessões agendadas que passaram do horário e não iniciaram
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
          .select('name, phone, last_reactivation_sent')
          .eq('user_id', session.user_id)
          .maybeSingle();

        if (!profile?.phone) continue;

        // Não enviar se já enviou reativação nas últimas 24h
        if (profile.last_reactivation_sent) {
          const lastSent = new Date(profile.last_reactivation_sent);
          if (lastSent > oneDayAgo) {
            logStep(`Skipping user ${session.user_id} - already sent reactivation recently`);
            continue;
          }
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
          const cleanPhone = cleanPhoneNumber(profile.phone);
          const result = await sendTextMessage(cleanPhone, message);

          if (result.success) {
            // Atualizar last_reactivation_sent
            await supabase
              .from('profiles')
              .update({ last_reactivation_sent: now.toISOString() })
              .eq('user_id', session.user_id);

            // Marcar sessão como no_show
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
      }
    }

    // ========================================================================
    // 2. DETECTAR USUÁRIOS INATIVOS (3+ dias sem mensagem)
    // Apenas se NÃO tiver sessão agendada
    // ========================================================================
    const { data: inactiveProfiles, error: inactiveError } = await supabase
      .from('profiles')
      .select('user_id, name, phone, last_message_date, last_reactivation_sent, do_not_disturb_until')
      .eq('status', 'active')
      .lt('last_message_date', threeDaysAgo.toISOString().split('T')[0])
      .not('phone', 'is', null);

    if (inactiveError) {
      logStep("Error fetching inactive profiles", { error: inactiveError.message });
    }

    if (inactiveProfiles && inactiveProfiles.length > 0) {
      logStep(`Found ${inactiveProfiles.length} potentially inactive profiles`);

      for (const profile of inactiveProfiles) {
        // Skip if do_not_disturb is active
        if (profile.do_not_disturb_until && new Date(profile.do_not_disturb_until) > now) {
          logStep(`Skipping user ${profile.user_id} - do not disturb until ${profile.do_not_disturb_until}`);
          continue;
        }

        // Verificar se já enviou reativação nas últimas 24h
        if (profile.last_reactivation_sent) {
          const lastSent = new Date(profile.last_reactivation_sent);
          if (lastSent > oneDayAgo) {
            logStep(`Skipping user ${profile.user_id} - already sent reactivation recently`);
            continue;
          }
        }

        // Verificar se tem sessão agendada - NÃO enviar se tiver
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

        const userName = profile.name || 'você';
        const lastMessageDate = profile.last_message_date ? new Date(profile.last_message_date) : null;
        const daysSinceMessage = lastMessageDate 
          ? Math.floor((now.getTime() - lastMessageDate.getTime()) / (24 * 60 * 60 * 1000))
          : 0;

        let message: string;

        if (daysSinceMessage >= 7) {
          // Mensagem para 7+ dias de inatividade
          message = `${userName}, tô pensando em você! 💜

Sei que a vida fica corrida às vezes. Quer marcar uma sessão pra gente colocar o papo em dia?

Estou aqui quando você precisar. ✨`;
        } else {
          // Mensagem para 3-6 dias de inatividade
          message = `Ei, ${userName}! Faz uns dias que a gente não se fala... 💜

Como você está? Tô aqui se precisar conversar!

Qualquer coisa, é só me mandar uma mensagem. ✨`;
        }

        try {
          const cleanPhone = cleanPhoneNumber(profile.phone!);
          const result = await sendTextMessage(cleanPhone, message);

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
      }
    }

    logStep(`Completed: ${missedSessionsSent} missed session messages, ${reactivationsSent} reactivation messages`);

    return new Response(JSON.stringify({
      success: true,
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
