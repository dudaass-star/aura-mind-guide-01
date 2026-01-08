import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";

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

    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const twentyThreeHoursFromNow = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    console.log(`🕐 Session reminder running at ${now.toISOString()}`);

    let reminders24hSent = 0;
    let reminders1hSent = 0;
    let reminders15mSent = 0;
    let postSessionSent = 0;

    // ========================================================================
    // LEMBRETE DE 24 HORAS + CONFIRMAÇÃO
    // ========================================================================
    const { data: sessions24h, error: error24h } = await supabase
      .from('sessions')
      .select(`id, user_id, scheduled_at, session_type, focus_topic`)
      .eq('status', 'scheduled')
      .eq('reminder_24h_sent', false)
      .gte('scheduled_at', twentyThreeHoursFromNow.toISOString())
      .lte('scheduled_at', twentyFourHoursFromNow.toISOString());

    if (error24h) {
      console.error('❌ Error fetching 24h sessions:', error24h);
    }

    if (sessions24h && sessions24h.length > 0) {
      for (const session of sessions24h) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, phone')
          .eq('user_id', session.user_id)
          .maybeSingle();

        if (!profile?.phone) {
          console.log(`⚠️ No phone for session ${session.id}`);
          continue;
        }

        const userName = profile.name || 'você';
        const sessionDate = new Date(session.scheduled_at);
        const sessionTime = sessionDate.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo'
        });

        // Buscar última sessão para continuidade
        const { data: lastSession } = await supabase
          .from('sessions')
          .select('session_summary, key_insights, commitments')
          .eq('user_id', session.user_id)
          .eq('status', 'completed')
          .order('ended_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Buscar compromissos pendentes
        const { data: pendingCommitments } = await supabase
          .from('commitments')
          .select('title, commitment_status')
          .eq('user_id', session.user_id)
          .eq('completed', false)
          .limit(3);

        let previewSection = '';
        
        // Adicionar preview da sessão anterior se existir
        if (lastSession?.session_summary) {
          previewSection += `
📝 *Na última sessão você trabalhou:*
${lastSession.session_summary.substring(0, 150)}...
`;
        }
        
        // Adicionar compromissos pendentes se existirem
        if (pendingCommitments && pendingCommitments.length > 0) {
          previewSection += `
🎯 *Compromissos que vamos revisar:*
${pendingCommitments.map((c: any) => `• ${c.title}`).join('\n')}
`;
        }

        const message = `Oi, ${userName}! 💜

Lembrete gentil: nossa sessão especial está marcada para amanhã às ${sessionTime}!
${previewSection}
📋 *Para você se preparar:*
• Como você está se sentindo hoje?
• O que gostaria de trabalhar na sessão?
• Houve algo importante desde nosso último papo?

Confirma que tá tudo certo? Me responde com "confirmo" ou me avisa se precisar reagendar! ✨`;

        try {
          const cleanPhone = cleanPhoneNumber(profile.phone);
          const result = await sendTextMessage(cleanPhone, message);

          if (result.success) {
            await supabase
              .from('sessions')
              .update({ 
                reminder_24h_sent: true,
                confirmation_requested: true 
              })
              .eq('id', session.id);
            
            reminders24hSent++;
            console.log(`✅ 24h reminder sent for session ${session.id}`);
          } else {
            console.error(`❌ Failed to send 24h reminder for session ${session.id}:`, result.error);
          }
        } catch (sendError) {
          console.error(`❌ Error sending 24h reminder for session ${session.id}:`, sendError);
        }
      }
    }

    // ========================================================================
    // LEMBRETE DE 1 HORA
    // ========================================================================
    const { data: sessions1h, error: error1h } = await supabase
      .from('sessions')
      .select(`id, user_id, scheduled_at, session_type, focus_topic`)
      .eq('status', 'scheduled')
      .eq('reminder_1h_sent', false)
      .lte('scheduled_at', oneHourFromNow.toISOString())
      .gt('scheduled_at', now.toISOString());

    if (error1h) {
      console.error('❌ Error fetching 1h sessions:', error1h);
    }

    if (sessions1h && sessions1h.length > 0) {
      for (const session of sessions1h) {
        // Pular se já enviamos o lembrete de 24h nesta mesma execução
        if (sessions24h?.some(s => s.id === session.id)) {
          continue;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('name, phone')
          .eq('user_id', session.user_id)
          .maybeSingle();

        if (!profile?.phone) {
          console.log(`⚠️ No phone for session ${session.id}`);
          continue;
        }

        const userName = profile.name || 'você';
        const sessionTime = new Date(session.scheduled_at).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo'
        });

        const message = `Oi, ${userName}! 🌟

Lembrete: nossa sessão especial começa em 1 hora (às ${sessionTime}).

Separa um cantinho tranquilo pra gente conversar com calma. Te espero lá! 💜`;

        try {
          const cleanPhone = cleanPhoneNumber(profile.phone);
          const result = await sendTextMessage(cleanPhone, message);

          if (result.success) {
            await supabase
              .from('sessions')
              .update({ reminder_1h_sent: true })
              .eq('id', session.id);
            
            reminders1hSent++;
            console.log(`✅ 1h reminder sent for session ${session.id}`);
          } else {
            console.error(`❌ Failed to send 1h reminder for session ${session.id}:`, result.error);
          }
        } catch (sendError) {
          console.error(`❌ Error sending 1h reminder for session ${session.id}:`, sendError);
        }
      }
    }

    // ========================================================================
    // LEMBRETE DE 15 MINUTOS
    // ========================================================================
    const { data: sessions15m, error: error15m } = await supabase
      .from('sessions')
      .select(`id, user_id, scheduled_at, session_type, focus_topic`)
      .eq('status', 'scheduled')
      .eq('reminder_15m_sent', false)
      .lte('scheduled_at', fifteenMinutesFromNow.toISOString())
      .gt('scheduled_at', now.toISOString());

    if (error15m) {
      console.error('❌ Error fetching 15m sessions:', error15m);
    }

    if (sessions15m && sessions15m.length > 0) {
      for (const session of sessions15m) {
        // Pular se já processamos nesta execução
        if (sessions1h?.some(s => s.id === session.id) || sessions24h?.some(s => s.id === session.id)) {
          continue;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('name, phone')
          .eq('user_id', session.user_id)
          .maybeSingle();

        if (!profile?.phone) {
          console.log(`⚠️ No phone for session ${session.id}`);
          continue;
        }

        const userName = profile.name || 'você';

        const message = `Faltam 15 minutinhos pra nossa sessão, ${userName}! ✨

Já estou aqui te esperando. Quando estiver pronta, é só me mandar uma mensagem que a gente começa. 💜`;

        try {
          const cleanPhone = cleanPhoneNumber(profile.phone);
          const result = await sendTextMessage(cleanPhone, message);

          if (result.success) {
            await supabase
              .from('sessions')
              .update({ reminder_15m_sent: true })
              .eq('id', session.id);
            
            reminders15mSent++;
            console.log(`✅ 15m reminder sent for session ${session.id}`);
          } else {
            console.error(`❌ Failed to send 15m reminder for session ${session.id}:`, result.error);
          }
        } catch (sendError) {
          console.error(`❌ Error sending 15m reminder for session ${session.id}:`, sendError);
        }
      }
    }

    // ========================================================================
    // INICIAR SESSÃO NO HORÁRIO - Mensagem proativa
    // Janela ampliada: -10 min (passado) a +3 min (futuro) para compensar delays do cron
    // ========================================================================
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const threeMinutesAhead = new Date(now.getTime() + 3 * 60 * 1000);
    let sessionStartsSent = 0;

    console.log(`🔍 Buscando sessões para iniciar entre ${tenMinutesAgo.toISOString()} e ${threeMinutesAhead.toISOString()}`);

    const { data: sessionsToStart, error: errorStart } = await supabase
      .from('sessions')
      .select('id, user_id, session_type, focus_topic, scheduled_at')
      .eq('status', 'scheduled')
      .eq('session_start_notified', false)
      .gte('scheduled_at', tenMinutesAgo.toISOString())
      .lte('scheduled_at', threeMinutesAhead.toISOString())
      .is('started_at', null);

    if (errorStart) {
      console.error('❌ Error fetching sessions to start:', errorStart);
    }

    if (sessionsToStart && sessionsToStart.length > 0) {
      console.log(`🚀 Found ${sessionsToStart.length} sessions to start`);
      
      for (const session of sessionsToStart) {
        // Pular se já processamos nesta execução
        if (sessions15m?.some(s => s.id === session.id) || 
            sessions1h?.some(s => s.id === session.id) || 
            sessions24h?.some(s => s.id === session.id)) {
          continue;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('name, phone')
          .eq('user_id', session.user_id)
          .maybeSingle();

        if (!profile?.phone) {
          console.log(`⚠️ No phone for session to start ${session.id}`);
          continue;
        }

        const userName = profile.name || 'você';

        const message = `Oi, ${userName}! Chegou a hora da nossa sessão especial! 💜

Estou aqui prontinha pra te ouvir. Quando quiser começar, é só me mandar uma mensagem.

Como você está se sentindo agora? ✨`;

        try {
          const cleanPhone = cleanPhoneNumber(profile.phone);
          const result = await sendTextMessage(cleanPhone, message);

          if (result.success) {
            // Atualizar sessão para in_progress e marcar como notificado
            await supabase
              .from('sessions')
              .update({ 
                session_start_notified: true,
                status: 'in_progress',
                started_at: new Date().toISOString()
              })
              .eq('id', session.id);
            
            // Buscar profile atual para incrementar contador
            const { data: currentProfile } = await supabase
              .from('profiles')
              .select('sessions_used_this_month')
              .eq('user_id', session.user_id)
              .single();
            
            // Atualizar profile para linkar com a sessão ativa (CRÍTICO para áudios funcionarem)
            await supabase
              .from('profiles')
              .update({ 
                current_session_id: session.id,
                sessions_used_this_month: (currentProfile?.sessions_used_this_month || 0) + 1 
              })
              .eq('user_id', session.user_id);
            
            sessionStartsSent++;
            console.log(`✅ Session started and profile updated for session ${session.id}`);
          } else {
            console.error(`❌ Failed to send session start for ${session.id}:`, result.error);
          }
        } catch (sendError) {
          console.error(`❌ Error sending session start for ${session.id}:`, sendError);
        }
      }
    }

    // ========================================================================
    // DETECTAR E FECHAR SESSÕES ABANDONADAS (30 min após fim previsto)
    // ========================================================================
    let abandonedSessionsClosed = 0;
    
    // Buscar sessões in_progress que deveriam ter terminado há mais de 30 minutos
    const { data: abandonedSessions, error: errorAbandoned } = await supabase
      .from('sessions')
      .select('id, user_id, scheduled_at, duration_minutes, started_at')
      .eq('status', 'in_progress')
      .lt('started_at', thirtyMinutesAgo.toISOString()); // Começou há mais de 30 min
    
    if (errorAbandoned) {
      console.error('❌ Error fetching abandoned sessions:', errorAbandoned);
    }
    
    if (abandonedSessions && abandonedSessions.length > 0) {
      for (const session of abandonedSessions) {
        // Calcular quando a sessão deveria ter terminado
        const startedAt = new Date(session.started_at);
        const expectedEndTime = new Date(startedAt.getTime() + (session.duration_minutes || 45) * 60 * 1000);
        const gracePeriodEnd = new Date(expectedEndTime.getTime() + 30 * 60 * 1000); // +30 min de tolerância
        
        // Se ainda está dentro do período de graça, pular
        if (now < gracePeriodEnd) {
          console.log(`⏭️ Session ${session.id} still within grace period`);
          continue;
        }
        
        console.log(`🔒 Closing abandoned session ${session.id} - should have ended at ${expectedEndTime.toISOString()}`);
        
        // Buscar profile para notificação
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, phone')
          .eq('user_id', session.user_id)
          .maybeSingle();
        
        // Marcar sessão como no_show (não compareceu/abandonou)
        await supabase
          .from('sessions')
          .update({ 
            status: 'no_show',
            ended_at: now.toISOString(),
            session_summary: 'Sessão encerrada automaticamente por inatividade.'
          })
          .eq('id', session.id);
        
        // Limpar current_session_id do profile
        await supabase
          .from('profiles')
          .update({ current_session_id: null })
          .eq('user_id', session.user_id);
        
        // Enviar mensagem de fechamento se tiver telefone
        if (profile?.phone) {
          const userName = profile.name || 'você';
          const message = `Oi, ${userName}! 💜

Percebi que nossa sessão ficou em silêncio por um tempo...

Tudo bem, a vida acontece! Quando você puder e quiser continuar, é só me chamar. Estou sempre aqui por você. ✨

Se quiser remarcar uma nova sessão, é só me dizer!`;
          
          try {
            const cleanPhone = cleanPhoneNumber(profile.phone);
            await sendTextMessage(cleanPhone, message);
            console.log(`✅ Abandonment message sent for session ${session.id}`);
          } catch (sendError) {
            console.error(`❌ Error sending abandonment message for session ${session.id}:`, sendError);
          }
        }
        
        abandonedSessionsClosed++;
      }
    }

    // ========================================================================
    // LEMBRETE PÓS-SESSÃO (30 minutos após término)
    // ========================================================================
    const { data: completedSessions, error: errorCompleted } = await supabase
      .from('sessions')
      .select(`id, user_id, session_summary, commitments, key_insights, ended_at`)
      .eq('status', 'completed')
      .eq('post_session_sent', false)
      .not('session_summary', 'is', null)
      .lte('ended_at', thirtyMinutesAgo.toISOString());

    if (errorCompleted) {
      console.error('❌ Error fetching completed sessions:', errorCompleted);
    }

    if (completedSessions && completedSessions.length > 0) {
      for (const session of completedSessions) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, phone')
          .eq('user_id', session.user_id)
          .maybeSingle();

        if (!profile?.phone || !session.session_summary) {
          console.log(`⚠️ No phone or summary for completed session ${session.id}`);
          continue;
        }

        const userName = profile.name || 'você';

        // Formatar compromissos
        const commitments = session.commitments || [];
        let commitmentsList = 'Nenhum compromisso definido';
        if (Array.isArray(commitments) && commitments.length > 0) {
          commitmentsList = commitments.map((c: any, i: number) => {
            if (typeof c === 'string') return `${i + 1}. ${c}`;
            if (typeof c === 'object' && c.title) return `${i + 1}. ${c.title}`;
            return `${i + 1}. ${JSON.stringify(c)}`;
          }).join('\n');
        }

        // Formatar insights
        const insights = session.key_insights || [];
        let insightsList = '';
        if (Array.isArray(insights) && insights.length > 0) {
          insightsList = insights.map((ins: any) => {
            if (typeof ins === 'string') return `• ${ins}`;
            return `• ${JSON.stringify(ins)}`;
          }).join('\n');
        }

        let message = `${userName}, foi incrível nossa sessão hoje! 💜

📝 *Resumo:*
${session.session_summary}

🎯 *Seus Compromissos:*
${commitmentsList}`;

        if (insightsList) {
          message += `

💡 *Insights:*
${insightsList}`;
        }

        message += `

Me conta durante a semana como está seu progresso! Estou aqui por você. ✨`;

        try {
          const cleanPhone = cleanPhoneNumber(profile.phone);
          const result = await sendTextMessage(cleanPhone, message);

          if (result.success) {
            await supabase
              .from('sessions')
              .update({ post_session_sent: true })
              .eq('id', session.id);
            
            postSessionSent++;
            console.log(`✅ Post-session summary sent for session ${session.id}`);

            // Enviar pesquisa de satisfação MELHORADA após 2 segundos
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const ratingMessage = `Antes de terminar, me conta: 🌟

*De 0 a 10, como você se sente agora comparado a quando começamos a sessão?*

(Só o número tá ótimo! E se quiser me dizer o que mais gostou ou o que posso melhorar, adoraria ouvir! 💜)`;

            const ratingResult = await sendTextMessage(cleanPhone, ratingMessage);
            
            if (ratingResult.success) {
              await supabase
                .from('sessions')
                .update({ rating_requested: true })
                .eq('id', session.id);
              console.log(`✅ Rating request sent for session ${session.id}`);
              
              // Agendar follow-up de 24h para compromissos
              const commitments = session.commitments || [];
              if (Array.isArray(commitments) && commitments.length > 0) {
                const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                
                for (const commitment of commitments) {
                  const title = typeof commitment === 'string' ? commitment : commitment.title || JSON.stringify(commitment);
                  
                  // Criar commitment na tabela para follow-up
                  await supabase.from('commitments').insert({
                    user_id: session.user_id,
                    session_id: session.id,
                    title: title,
                    due_date: tomorrow.toISOString(),
                    commitment_status: 'pending'
                  });
                }
                console.log(`✅ Created ${commitments.length} commitment follow-ups for session ${session.id}`);
              }
            }
          } else {
            console.error(`❌ Failed to send post-session summary for session ${session.id}:`, result.error);
          }
        } catch (sendError) {
          console.error(`❌ Error sending post-session summary for session ${session.id}:`, sendError);
        }
      }
    }

    console.log(`📊 Session reminders completed: ${reminders24hSent} 24h, ${reminders1hSent} 1h, ${reminders15mSent} 15m, ${sessionStartsSent} starts, ${postSessionSent} post-session, ${abandonedSessionsClosed} abandoned closed`);

    return new Response(JSON.stringify({ 
      success: true,
      reminders_24h_sent: reminders24hSent,
      reminders_1h_sent: reminders1hSent,
      reminders_15m_sent: reminders15mSent,
      session_starts_sent: sessionStartsSent,
      post_session_sent: postSessionSent,
      abandoned_sessions_closed: abandonedSessionsClosed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Session reminder error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
