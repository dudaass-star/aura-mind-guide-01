import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { sendMessage, sendProactive } from "../_shared/whatsapp-provider.ts";
import { sendFreeText, isWithin24hWindow } from "../_shared/whatsapp-official.ts";
import { getInstanceConfigForUser, antiBurstDelay } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Dispara o micro-agent `session-extractor` para preencher summary/insights/commitments.
// Aguarda a extração e relê a sessão para retornar os campos atualizados.
// Usado em dois pontos: (a) sessão abandonada mas com participação ativa; (b) sessão
// `completed` que ficou sem summary (loop infinito de "No summary for completed session").
async function runSessionExtractor(
  supabase: any,
  sessionId: string,
): Promise<{ summary: string; key_insights: any[]; commitments: any[] } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('session-extractor', {
      body: { session_id: sessionId },
    });
    if (error) {
      console.error(`⚠️ session-extractor falhou para ${sessionId}:`, error);
      return null;
    }
    if (!data?.ok) {
      console.warn(`⚠️ session-extractor não confirmou sucesso para ${sessionId}:`, data);
      return null;
    }
    // Relê para ter os valores efetivamente persistidos
    const { data: refreshed } = await supabase
      .from('sessions')
      .select('session_summary, key_insights, commitments')
      .eq('id', sessionId)
      .maybeSingle();
    return {
      summary: refreshed?.session_summary || '',
      key_insights: refreshed?.key_insights || [],
      commitments: refreshed?.commitments || [],
    };
  } catch (err) {
    console.error(`⚠️ Erro inesperado ao invocar session-extractor para ${sessionId}:`, err);
    return null;
  }
}

// Envia resumo + rating de uma sessão `completed` inline (sem esperar o próximo
// ciclo do cron de 5min). Marca post_session_sent e rating_requested no fim.
// Retorna true apenas se o rating foi entregue com sucesso.
async function dispatchPostSession(
  supabase: any,
  sessionId: string,
  now: Date,
): Promise<boolean> {
  try {
    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .select('id, user_id, session_summary, commitments, key_insights, ended_at, post_session_sent')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionErr || !session) {
      console.error(`⚠️ dispatchPostSession: sessão ${sessionId} não encontrada`, sessionErr);
      return false;
    }
    if (session.post_session_sent === true) {
      console.log(`ℹ️ dispatchPostSession: sessão ${sessionId} já processada`);
      return true;
    }

    // TRAVA 1 (sessão Simone, 22/08): não mandar resumo+nota enquanto a Aura ainda
    // está entregando as bolhas da despedida. Espera até 60s pelo fim da entrega.
    for (let attempt = 0; attempt < 20; attempt++) {
      const { data: respState } = await supabase
        .from('aura_response_state')
        .select('is_responding')
        .eq('user_id', session.user_id)
        .maybeSingle();
      if (respState?.is_responding !== true) break;
      console.log(`⏳ dispatchPostSession: Aura ainda respondendo (${sessionId}) — aguardando 3s (tentativa ${attempt + 1}/20)`);
      await new Promise((r) => setTimeout(r, 3000));
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, phone')
      .eq('user_id', session.user_id)
      .maybeSingle();


    if (!profile?.phone) {
      console.log(`⚠️ dispatchPostSession: sem telefone para sessão ${sessionId}`);
      await supabase.from('sessions').update({ post_session_sent: true }).eq('id', sessionId);
      return false;
    }

    if (!session.session_summary) {
      console.log(`⚠️ dispatchPostSession: sem summary para ${sessionId} — disparando session-extractor`);
      const recovered = await runSessionExtractor(supabase, sessionId);
      if (!recovered?.summary) {
        console.warn(`⚠️ dispatchPostSession: extractor não gerou summary para ${sessionId}`);
        return false;
      }
      session.session_summary = recovered.summary;
      session.key_insights = recovered.key_insights;
      session.commitments = recovered.commitments;
    }

    const userName = profile.name || 'você';
    const commitments = session.commitments || [];
    let commitmentsList = 'Nenhum compromisso definido';
    if (Array.isArray(commitments) && commitments.length > 0) {
      commitmentsList = commitments.map((c: any, i: number) => {
        if (typeof c === 'string') return `${i + 1}. ${c}`;
        if (typeof c === 'object' && c.title) return `${i + 1}. ${c.title}`;
        return `${i + 1}. ${JSON.stringify(c)}`;
      }).join('\n');
    }

    const insights = session.key_insights || [];
    let insightsList = '';
    if (Array.isArray(insights) && insights.length > 0) {
      insightsList = insights.map((ins: any) => {
        if (typeof ins === 'string') return `• ${ins}`;
        return `• ${JSON.stringify(ins)}`;
      }).join('\n');
    }

    let message = `${userName}, foi incrível nossa sessão hoje! 💜\n\n📝 *Resumo:*\n${session.session_summary}\n\n🎯 *Seus Compromissos:*\n${commitmentsList}`;
    if (insightsList) {
      message += `\n\n💡 *Insights:*\n${insightsList}`;
    }
    message += `\n\nMe conta durante a semana como está seu progresso! Estou aqui por você. ✨`;

    const cleanPhone = cleanPhoneNumber(profile.phone);
    const summaryResult = await sendProactive(cleanPhone, message, 'session_reminder', session.user_id);
    if (!summaryResult.success) {
      console.error(`❌ dispatchPostSession: falha no resumo de ${sessionId}:`, summaryResult.error);
      return false;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    const ratingMessage = `Antes de fechar, me conta rapidinho: ⭐\n\n*De 1 a 5, que nota você dá pra nossa sessão de hoje?*\n\n(Só o número tá ótimo! Se quiser comentar o que mais gostou ou o que posso melhorar, adoraria ouvir 💜)`;

    const ratingResult = await sendProactive(cleanPhone, ratingMessage, 'checkin', session.user_id);
    let ratingSuccess = false;

    if (ratingResult.success) {
      ratingSuccess = true;
      console.log(`✅ dispatchPostSession: rating inline enviado para ${sessionId}`);
      try {
        await supabase.from('messages').insert({
          user_id: session.user_id,
          role: 'assistant',
          content: ratingMessage,
        });
      } catch (persistErr) {
        console.warn(`⚠️ dispatchPostSession: não persistiu rating em messages para ${sessionId}:`, persistErr);
      }

      const cmts = session.commitments || [];
      if (Array.isArray(cmts) && cmts.length > 0) {
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        for (const c of cmts) {
          const title = typeof c === 'string' ? c : c.title || JSON.stringify(c);
          await supabase.from('commitments').insert({
            user_id: session.user_id,
            session_id: sessionId,
            title,
            due_date: tomorrow.toISOString(),
            commitment_status: 'pending',
          });
        }
        console.log(`✅ dispatchPostSession: ${cmts.length} compromissos criados para ${sessionId}`);
      }
    } else {
      console.error(`❌ dispatchPostSession: falha no rating de ${sessionId}:`, ratingResult.error);
      try {
        await supabase.from('failed_message_log').insert({
          user_id: session.user_id,
          phone: cleanPhone,
          content: ratingMessage,
          error: ratingResult.error || 'unknown',
          function_name: 'session-reminder/rating-inline',
        });
      } catch (logErr) {
        console.warn(`⚠️ dispatchPostSession: não logou falha de rating para ${sessionId}:`, logErr);
      }
    }

    await supabase.from('sessions').update({
      post_session_sent: true,
      ...(ratingSuccess && { rating_requested: true }),
    }).eq('id', sessionId);

    return ratingSuccess;
  } catch (err) {
    console.error(`❌ dispatchPostSession: erro inesperado para ${sessionId}:`, err);
    return false;
  }
}

function getBrtHour(): number {
  return (new Date().getUTCHours() - 3 + 24) % 24;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fast-path: invocação imediata pelo aura-agent logo após despedida.
    // Body: { trigger: 'post_session_immediate', session_id: '<uuid>' }
    // Pula o filtro de "5 min de carência" e processa SÓ a sessão indicada.
    let immediateSessionId: string | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json().catch(() => null);
        if (body?.trigger === 'post_session_immediate' && typeof body.session_id === 'string') {
          immediateSessionId = body.session_id;
          console.log(`⚡ Fast-path post-session imediato para sessão ${immediateSessionId}`);
        }
      } catch {
        // body opcional — segue scan normal
      }
    }

    const now = new Date();
    const brtHour = getBrtHour();
    const isQuietHours = brtHour < 8 || brtHour >= 22;
    if (isQuietHours) {
      console.log(`🌙 Quiet hours (${brtHour}h BRT) - only time-sensitive reminders (5m, start) will be sent`);
    }
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    // Janela ampliada para o lembrete T-5min: aceita sessões com scheduled_at
    // entre now-2min e now+10min — tolerante a atrasos do cron (até ~5min).
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const twentyThreeHoursFromNow = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    // Grace period ampliado: 60 min (antes 30) para missed/abandoned sessions —
    // dá mais margem para usuário responder tardiamente sem virar no_show.
    const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000);

    console.log(`🕐 Session reminder running at ${now.toISOString()}`);

    let reminders24hSent = 0;
    let reminders5mSent = 0;
    let postSessionSent = 0;

    // ========================================================================
    // LEMBRETE DE 24 HORAS + CONFIRMAÇÃO (skip during quiet hours)
    // ========================================================================
    if (isQuietHours) {
      console.log('🌙 Skipping 24h reminders during quiet hours');
    }
    const { data: sessions24h, error: error24h } = isQuietHours ? { data: null, error: null } : await supabase
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
          .select('name, phone, whatsapp_instance_id, last_message_date, last_user_message_at')
          .eq('user_id', session.user_id)
          .maybeSingle();

        if (!profile?.phone) {
          console.log(`⚠️ No phone for session ${session.id}`);
          continue;
        }

        // Cutoff de 14 dias: se usuário sumiu há 14+ dias, cancela a sessão
        // (não apenas silencia) e limpa pending_insight relacionado.
        const lastMsg = profile.last_message_date ? new Date(profile.last_message_date) : null;
        if (lastMsg && (Date.now() - lastMsg.getTime()) > 14 * 24 * 60 * 60 * 1000) {
          console.log(`📅 [SESSION_CUTOFF_14D] user=${session.user_id} session=${session.id} last_msg=${profile.last_message_date} (24h reminder)`);
          await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', session.id);
          const { data: curProf } = await supabase
            .from('profiles')
            .select('pending_insight')
            .eq('user_id', session.user_id)
            .maybeSingle();
          const cur = curProf?.pending_insight as string | null | undefined;
          if (cur && (cur.includes(session.id))) {
            await supabase.from('profiles').update({ pending_insight: null }).eq('user_id', session.user_id);
          }
          continue;
        }

        // 24h reminder: ONLY send as free text if 24h window is open
        const windowOpen = isWithin24hWindow(profile.last_user_message_at);
        if (!windowOpen) {
          console.log(`⏭️ Skipping 24h reminder for session ${session.id}: 24h window closed (template reserved for 5min)`);
          // Still mark as sent so we don't retry
          await supabase.from('sessions').update({ reminder_24h_sent: true }).eq('id', session.id);
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
        
        if (lastSession?.session_summary) {
          previewSection += `
📝 *Na última sessão você trabalhou:*
${lastSession.session_summary.substring(0, 150)}...
`;
        }
        
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
          // Usa sendProactive para ganhar prefixo "Lembrete de sessão 🕐" e
          // cair em template caso a janela 24h esteja fechada.
          const result = await sendProactive(cleanPhone, message, 'session_reminder', session.user_id);

          if (result.success) {
            await supabase
              .from('sessions')
              .update({ 
                reminder_24h_sent: true,
                confirmation_requested: true 
              })
              .eq('id', session.id);
            
            reminders24hSent++;
            console.log(`✅ 24h reminder sent as free text for session ${session.id}`);
          } else {
            console.error(`❌ Failed to send 24h reminder for session ${session.id}:`, result.error);
          }
        } catch (sendError) {
          console.error(`❌ Error sending 24h reminder for session ${session.id}:`, sendError);
        }
      }
    }

    // ========================================================================
    // LEMBRETE DE 5 MINUTOS
    // ========================================================================
    const { data: sessions5m, error: error5m } = await supabase
      .from('sessions')
      .select(`id, user_id, scheduled_at, session_type, focus_topic`)
      .eq('status', 'scheduled')
      .eq('reminder_5m_sent', false)
      .lte('scheduled_at', tenMinutesFromNow.toISOString())
      .gte('scheduled_at', twoMinutesAgo.toISOString());

    if (error5m) {
      console.error('❌ Error fetching 5m sessions:', error5m);
    }

    if (sessions5m && sessions5m.length > 0) {
      for (const session of sessions5m) {
        if (sessions24h?.some(s => s.id === session.id)) continue;

        const { data: profile } = await supabase
          .from('profiles')
          .select('name, phone, whatsapp_instance_id, last_message_date')
          .eq('user_id', session.user_id)
          .maybeSingle();

        if (!profile?.phone) { console.log(`⚠️ No phone for session ${session.id}`); continue; }

        // Cutoff de 14 dias: cancela sessão se usuário sumiu há 14+ dias.
        const lastMsg5m = profile.last_message_date ? new Date(profile.last_message_date) : null;
        if (lastMsg5m && (Date.now() - lastMsg5m.getTime()) > 14 * 24 * 60 * 60 * 1000) {
          console.log(`📅 [SESSION_CUTOFF_14D] user=${session.user_id} session=${session.id} last_msg=${profile.last_message_date} (5min reminder)`);
          await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', session.id);
          const { data: curProf5 } = await supabase
            .from('profiles')
            .select('pending_insight')
            .eq('user_id', session.user_id)
            .maybeSingle();
          const cur5 = curProf5?.pending_insight as string | null | undefined;
          if (cur5 && cur5.includes(session.id)) {
            await supabase.from('profiles').update({ pending_insight: null }).eq('user_id', session.user_id);
          }
          continue;
        }

        const userName = profile.name || 'você';
        const message = `Faltam 5 minutinhos pra nossa sessão, ${userName}! ✨\n\nJá estou aqui te esperando. Quando estiver pronta, é só me mandar uma mensagem que a gente começa. 💜`;

        try {
          const cleanPhone = cleanPhoneNumber(profile.phone);

          // Salva pending_insight com [SESSION_START] para iniciar sessão no clique do botão.
          // Só sobrescreve se estiver vazio OU se já contiver [SESSION_PREARM] da mesma sessão.
          const { data: curProf } = await supabase
            .from('profiles')
            .select('pending_insight')
            .eq('user_id', session.user_id)
            .maybeSingle();
          const cur = curProf?.pending_insight as string | null | undefined;
          const safeToOverwrite = !cur || cur.startsWith('[SESSION_PREARM]') || cur.startsWith('[SESSION_START]');
          if (safeToOverwrite) {
            await supabase.from('profiles').update({
              pending_insight: `[SESSION_START]${session.id}`
            }).eq('user_id', session.user_id);
          } else {
            console.log(`⏭️ 5m reminder ${session.id}: pending_insight ocupado (${cur?.substring(0, 30)}) — não sobrescreve`);
          }

          const result = await sendProactive(cleanPhone, message, 'session_reminder', session.user_id);

          if (result.success) {
            // Idempotência: só marca reminder_5m_sent quando o envio confirma sucesso.
            await supabase.from('sessions').update({ reminder_5m_sent: true }).eq('id', session.id);
            reminders5mSent++;
            console.log(`✅ 5m reminder sent (template) for session ${session.id} + pending_insight [SESSION_START] saved`);
          } else {
            // Não marcar reminder_5m_sent — permite retry no próximo tick do cron.
            // Reverte pending_insight apenas se fomos nós que o setamos.
            if (safeToOverwrite) {
              await supabase.from('profiles').update({ pending_insight: null }).eq('user_id', session.user_id);
            }
            console.error(`❌ Failed to send 5m reminder for session ${session.id} (will retry next tick):`, result.error);
          }
        } catch (sendError) {
          console.error(`❌ Error sending 5m reminder for session ${session.id}:`, sendError);
        }
      }
    }

    // ========================================================================
    // INICIAR SESSÃO NO HORÁRIO - APENAS NOTIFICA, não marca como in_progress
    // Janela ampliada: -10 min (passado) a +3 min (futuro) para compensar delays do cron
    // CORREÇÃO: Agora só marca session_start_notified=true, espera resposta do usuário
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
      console.log(`🚀 Found ${sessionsToStart.length} sessions to notify`);
      
      for (const session of sessionsToStart) {
        // Pular se já processamos nesta execução
        if (sessions5m?.some(s => s.id === session.id) || 
            sessions24h?.some(s => s.id === session.id)) {
          continue;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('name, phone, whatsapp_instance_id, last_user_message_at')
          .eq('user_id', session.user_id)
          .maybeSingle();

        if (!profile?.phone) {
          console.log(`⚠️ No phone for session to start ${session.id}`);
          continue;
        }

        // Session start notification: ONLY send as free text if 24h window is open
        // (the 5min template already covers this — no need to waste another template)
        const windowOpen = isWithin24hWindow(profile.last_user_message_at);
        if (!windowOpen) {
          console.log(`⏭️ Skipping session start notification for ${session.id}: 24h window closed (5min template already sent)`);
          await supabase.from('sessions').update({ session_start_notified: true }).eq('id', session.id);
          continue;
        }

        const userName = profile.name || 'você';

        const message = `Oi, ${userName}! 💜 Chegou a hora da nossa sessão especial!

Esse é nosso momento de 45 minutos pra gente ir mais fundo, diferente das conversas do dia a dia.

Você está pronta(o) pra começar? Me responde um "vamos" ou "bora" quando quiser iniciar! ✨`;

        try {
          const cleanPhone = cleanPhoneNumber(profile.phone);
          // Padroniza com lembrete 5min: usa sendProactive para garantir título
          // "Lembrete de sessão 🕐" no free-text (janela aberta já é checada acima).
          const result = await sendProactive(cleanPhone, message, 'session_reminder', session.user_id);

          if (result.success) {
            await supabase
              .from('sessions')
              .update({ session_start_notified: true })
              .eq('id', session.id);
            
            sessionStartsSent++;
            console.log(`✅ Session start notification sent as free text for session ${session.id}`);
          } else {
            console.error(`❌ Failed to send session start notification for ${session.id}:`, result.error);
          }
        } catch (sendError) {
          console.error(`❌ Error sending session start notification for ${session.id}:`, sendError);
        }
      }
    }

    // (10-minute reminder removed — simplified to 24h + 5min only)

    // ========================================================================
    // DETECTAR SESSÕES NOTIFICADAS MAS NUNCA INICIADAS (missed - 30 min após notificação)
    // IMPORTANTE: Sempre fechamos no banco; mensagem suprimida em quiet hours.
    // ========================================================================
    let missedSessionsClosed = 0;
    
    const { data: missedSessions, error: errorMissed } = await supabase
      .from('sessions')
      .select('id, user_id, scheduled_at')
      .eq('status', 'scheduled')
      .eq('session_start_notified', true)
      .is('started_at', null)
      .lt('scheduled_at', sixtyMinutesAgo.toISOString()); // Agendada há mais de 60 min (grace ampliado)
    
    if (errorMissed) {
      console.error('❌ Error fetching missed sessions:', errorMissed);
    }
    
    if (missedSessions && missedSessions.length > 0) {
      for (const session of missedSessions) {
        console.log(`📭 Session ${session.id} was notified but user never responded - marking as missed`);
        
        // Buscar profile para notificação
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, phone, whatsapp_instance_id')
          .eq('user_id', session.user_id)
          .maybeSingle();
        
        // Marcar sessão como cancelled (não como no_show, pois usuário nunca iniciou)
        await supabase
          .from('sessions')
          .update({ 
            status: 'cancelled',
            ended_at: now.toISOString(),
            session_summary: 'Usuário não respondeu à notificação de início da sessão.',
            closure_mode: 'no_show'
          })
          .eq('id', session.id);
        
        // Enviar mensagem oferecendo reagendamento (suprimido em quiet hours)
        if (profile?.phone && !isQuietHours) {
          const userName = profile.name || 'você';
          const message = `Oi ${userName}! 💜

Parece que não conseguimos conectar pra sessão de hoje. Tudo bem, acontece!

Quer remarcar pra outro horário? É só me dizer quando fica bom pra você. ✨`;
          
          try {
            const cleanPhone = cleanPhoneNumber(profile.phone);
            const instanceConfig = await getInstanceConfigForUser(supabase, session.user_id);
            const sendResult = await sendProactive(cleanPhone, message, 'session_reminder', session.user_id);
            if (sendResult.success) {
              console.log(`✅ Missed session message sent for session ${session.id}`);
            } else {
              console.error(`❌ Failed to send missed session message for session ${session.id}: ${sendResult.error}`);
            }
          } catch (sendError) {
            console.error(`❌ Error sending missed session message for session ${session.id}:`, sendError);
          }
        } else if (isQuietHours) {
          console.log(`🌙 Session ${session.id} marked missed during quiet hours - message suppressed`);
        }
        
        missedSessionsClosed++;
      }
    }

    // ========================================================================
    // DETECTAR E FECHAR SESSÕES ABANDONADAS (30 min após fim previsto)
    // CORREÇÃO: Diferenciar entre usuário que participou vs apenas recebeu abertura
    // IMPORTANTE: Sempre fechamos no banco (integridade dos dados); mensagem proativa
    // é suprimida durante quiet hours para respeitar silêncio noturno.
    // ========================================================================
    let abandonedSessionsClosed = 0;
    
    // Buscar sessões in_progress que deveriam ter terminado há mais de 30 minutos
    const { data: abandonedSessions, error: errorAbandoned } = await supabase
      .from('sessions')
      .select('id, user_id, scheduled_at, duration_minutes, started_at')
      .eq('status', 'in_progress')
      .lt('started_at', sixtyMinutesAgo.toISOString()); // Começou há mais de 60 min
    
    if (errorAbandoned) {
      console.error('❌ Error fetching abandoned sessions:', errorAbandoned);
    }
    
    if (abandonedSessions && abandonedSessions.length > 0) {
      for (const session of abandonedSessions) {
        // Calcular quando a sessão deveria ter terminado
        const startedAt = new Date(session.started_at);
        const durationMin = session.duration_minutes || 45;
        const expectedEndTime = new Date(startedAt.getTime() + durationMin * 60 * 1000);
        const gracePeriodEnd = new Date(expectedEndTime.getTime() + 30 * 60 * 1000); // +30 min de tolerância
        // Teto operacional: 2x a duração prevista. Só aqui o tempo encerra sozinho.
        const hardCapEnd = new Date(startedAt.getTime() + durationMin * 2 * 60 * 1000);

        // Se ainda está dentro do período de graça, pular
        if (now < gracePeriodEnd) {
          console.log(`⏭️ Session ${session.id} still within grace period`);
          continue;
        }

        // ANTI-MULETA DO RELÓGIO: nunca encerrar sessão VIVA por tempo.
        // Só encerra se houve silêncio real de 15+ min — ou se passou do teto operacional.
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('created_at')
          .eq('user_id', session.user_id)
          .gte('created_at', session.started_at)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const lastMsgAt = lastMsg?.created_at ? new Date(lastMsg.created_at) : startedAt;
        const silenceMin = Math.floor((now.getTime() - lastMsgAt.getTime()) / 60000);

        if (silenceMin < 15 && now < hardCapEnd) {
          console.log(`🫂 Session ${session.id} AINDA VIVA (silêncio de ${silenceMin} min) — não encerrando por tempo`);
          continue;
        }
        
        
        // NOVO: Contar mensagens do usuário DURANTE a sessão para diferenciar
        const { count: userMsgsInSession } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', session.user_id)
          .eq('role', 'user')
          .gte('created_at', session.started_at);
        
        // Buscar profile para notificação
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, phone, whatsapp_instance_id')
          .eq('user_id', session.user_id)
          .maybeSingle();
        
        const userName = profile?.name || 'você';
        let statusToSet: string;
        let summaryToSet: string;
        let messageToSend: string;
        
        if ((userMsgsInSession || 0) <= 1) {
          // Usuário respondeu apenas 1 mensagem ou menos - provavelmente não viu ou não pôde continuar
          statusToSet = 'no_show';
          summaryToSet = 'Usuário não participou ativamente da sessão após a abertura.';
          messageToSend = `Oi ${userName}! 💜

Parece que não conseguimos fazer nossa sessão hoje. Tudo bem, a vida acontece!

Quer remarcar pra outro horário? É só me dizer quando fica bom pra você. ✨`;
        } else if ((userMsgsInSession || 0) >= 5) {
          // Usuário participou ativamente (5+ msgs) mas sessão expirou - marcar como completed
          // Marcar como completed primeiro; o session-extractor lê do banco usando started_at
          await supabase
            .from('sessions')
            .update({ status: 'completed', ended_at: now.toISOString() })
            .eq('id', session.id);
          const extracted = await runSessionExtractor(supabase, session.id);
          statusToSet = 'completed';
          summaryToSet = extracted?.summary
            || 'Sessão encerrada automaticamente após período de inatividade. O usuário participou ativamente da conversa.';
          messageToSend = `Oi ${userName}! 💜

Nossa sessão de hoje foi ótima, mesmo que tenha ficado em silêncio no final. Já salvei o resumo pra você!

Se quiser retomar de onde paramos ou agendar a próxima, é só me chamar. ✨`;

          // key_insights e commitments já foram persistidos pelo session-extractor.

          // Garante summary persistido antes do dispatch inline (extractor já rodou acima,
          // mas se o extractor devolveu algo, gravamos no banco pra dispatchPostSession ler).
          if (extracted?.summary) {
            await supabase
              .from('sessions')
              .update({ session_summary: extracted.summary })
              .eq('id', session.id);
          }

          // FIX #1: rating imediato. Dispara resumo+rating inline em vez de esperar
          // o próximo ciclo do cron (gap de 5-10min → ~15s). Em caso de falha,
          // o loop de completedSessions abaixo segue como fallback no próximo tick.
          try {
            const ok = await dispatchPostSession(supabase, session.id, now);
            if (ok) {
              console.log(`⚡ Rating inline OK para sessão ${session.id} — pulando mensagem genérica de fechamento`);
              // Limpar current_session_id antes de continuar (não vamos cair no bloco de update abaixo
              // porque dispatchPostSession já mandou resumo + rating com o conteúdo real).
              await supabase
                .from('profiles')
                .update({ current_session_id: null })
                .eq('user_id', session.user_id);
              abandonedSessionsClosed++;
              continue;
            }
            console.warn(`⚠️ Rating inline falhou para sessão ${session.id} — fallback enviará mensagem genérica e cron tentará rating no próximo ciclo`);
          } catch (inlineErr) {
            console.error(`❌ Erro no dispatchPostSession inline para ${session.id}:`, inlineErr);
          }
        } else {
          // Usuário participou pouco (2-4 msgs) - manter como no_show
          statusToSet = 'no_show';
          summaryToSet = 'Sessão encerrada automaticamente - usuário parou de responder durante a sessão.';
          messageToSend = `Oi ${userName}! 💜

Nossa sessão ficou em silêncio por um tempo... Tudo bem aí?

Quando puder e quiser continuar, é só me chamar. Estou sempre aqui por você! ✨

Se quiser remarcar uma nova sessão, é só me dizer!`;
        }
        
        console.log(`🔒 Closing session ${session.id} - user msgs: ${userMsgsInSession}, status: ${statusToSet}`);
        
        // Marcar sessão
        await supabase
          .from('sessions')
          .update({ 
            status: statusToSet,
            ended_at: now.toISOString(),
            session_summary: summaryToSet,
            closure_mode: statusToSet === 'no_show' ? 'no_show' : 'unilateral'
          })
          .eq('id', session.id);
        
        // Limpar current_session_id do profile
        await supabase
          .from('profiles')
          .update({ current_session_id: null })
          .eq('user_id', session.user_id);
        
        // Enviar mensagem de fechamento se tiver telefone.
        // Quiet hours NÃO se aplica aqui: é resposta direta a uma sessão
        // que o usuário iniciou — fechar sessão é parte da própria interação.
        if (profile?.phone) {
          try {
            const cleanPhone = cleanPhoneNumber(profile.phone);
            const instanceConfig = await getInstanceConfigForUser(supabase, session.user_id);
            const sendResult = await sendProactive(cleanPhone, messageToSend, 'session_reminder', session.user_id);
            if (sendResult.success) {
              console.log(`✅ Closure message sent for session ${session.id}`);
            } else {
              console.error(`❌ Failed to send closure message for session ${session.id}: ${sendResult.error}`);
            }
          } catch (sendError) {
            console.error(`❌ Error sending closure message for session ${session.id}:`, sendError);
          }
        }
        
        abandonedSessionsClosed++;
      }
    }

    // ========================================================================
    // LEMBRETE PÓS-SESSÃO (fallback: 5 minutos após término se não foi enviado pelo aura-agent)
    // NÃO respeita quiet hours: rating/resumo são fechamento da própria sessão
    // que o usuário acabou de ter. Bloquear aqui causa perda permanente do rating
    // (sessão sai da janela de 2h durante o silêncio).
    // ========================================================================
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    // Janela máxima: só enviar rating para sessões finalizadas nas últimas 2h.
    // Isso evita disparos tardios em sessões antigas (ex: legado sem rating_requested marcado,
    // ou sessões reabertas/migradas) que poderiam gerar mensagem "do nada" no WhatsApp.
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    // Filtramos por rating_requested=false (não por post_session_sent).
    // No fast-path (immediateSessionId), filtra só pela sessão alvo, sem carência de 5min,
    // para entregar resumo+rating enquanto a usuária ainda está com o WhatsApp aberto.
    let completedQuery = supabase
      .from('sessions')
      .select(`id, user_id, session_summary, commitments, key_insights, ended_at, post_session_sent`)
      .eq('status', 'completed')
      .eq('rating_requested', false);
    if (immediateSessionId) {
      completedQuery = completedQuery.eq('id', immediateSessionId);
    } else {
      completedQuery = completedQuery
        .lte('ended_at', fiveMinutesAgo.toISOString())
        .gte('ended_at', twoHoursAgo.toISOString());
    }
    const { data: completedSessions, error: errorCompleted } = await completedQuery;

    if (errorCompleted) {
      console.error('❌ Error fetching completed sessions:', errorCompleted);
    }

    if (completedSessions && completedSessions.length > 0) {
      for (const session of completedSessions) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, phone, whatsapp_instance_id')
          .eq('user_id', session.user_id)
          .maybeSingle();

        if (!profile?.phone) {
          console.log(`⚠️ No phone for completed session ${session.id} (user: ${session.user_id})`);
          // Marcar como enviado para parar de tentar em cada ciclo
          await supabase
            .from('sessions')
            .update({ post_session_sent: true })
            .eq('id', session.id);
          continue;
        }
        if (!session.session_summary) {
          console.log(`⚠️ No summary for completed session ${session.id} — disparando session-extractor para recuperar`);
          const recovered = await runSessionExtractor(supabase, session.id);
          if (!recovered?.summary) {
            console.warn(`⚠️ session-extractor não conseguiu gerar summary para ${session.id} neste ciclo — tentará novamente no próximo`);
            continue;
          }
          // Atualiza a referência local pro restante deste loop usar os dados frescos
          session.session_summary = recovered.summary;
          session.key_insights = recovered.key_insights;
          session.commitments = recovered.commitments;
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
          const instanceConfig = await getInstanceConfigForUser(supabase, session.user_id);

          // Caminho feliz: aura-agent já enviou o resumo imediatamente.
          // Aqui mandamos APENAS a pergunta de rating.
          // Caminho fallback (post_session_sent=false): aura-agent falhou
          // ou não enviou — mandamos resumo + rating.
          let summarySent = session.post_session_sent === true;
          if (!summarySent) {
            const result = await sendProactive(cleanPhone, message, 'session_reminder', session.user_id);
            if (!result.success) {
              console.error(`❌ Failed to send post-session summary for session ${session.id}:`, result.error);
              continue;
            }
            summarySent = true;
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.log(`ℹ️ Resumo já enviado pelo aura-agent para sessão ${session.id} — enviando apenas rating`);
          }

          {
            let ratingSuccess = false;

            const ratingMessage = `Antes de fechar, me conta rapidinho: ⭐

*De 1 a 5, que nota você dá pra nossa sessão de hoje?*

(Só o número tá ótimo! Se quiser comentar o que mais gostou ou o que posso melhorar, adoraria ouvir 💜)`;

            // Categoria 'checkin' = sem prefixo de título no free-text.
            // Antes usávamos 'session_reminder' que prefixava "Lembrete de sessão 🕐",
            // o que confundia a usuária (parecia lembrete da próxima sessão, não rating).
            const ratingResult = await sendProactive(cleanPhone, ratingMessage, 'checkin', session.user_id);

            if (ratingResult.success) {
              ratingSuccess = true;
              console.log(`✅ Rating request sent for session ${session.id} (type=${ratingResult.type}, sid=${(ratingResult as any).messageId ?? 'n/a'})`);

              // Persistir a pergunta de rating em `messages` para auditoria/traceability.
              // sendProactive não grava em messages — sem isso ficamos cegos pra confirmar
              // se a mensagem realmente saiu (já vimos casos de Twilio aceitar mas nada chegar).
              try {
                await supabase.from('messages').insert({
                  user_id: session.user_id,
                  role: 'assistant',
                  content: ratingMessage,
                });
              } catch (persistErr) {
                console.warn(`⚠️ Could not persist rating message for session ${session.id}:`, persistErr);
              }
              
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
            } else {
              // Falha real: registra em failed_message_log pra investigação.
              console.error(`❌ Rating send failed for session ${session.id}:`, ratingResult.error);
              try {
                await supabase.from('failed_message_log').insert({
                  user_id: session.user_id,
                  phone: cleanPhone,
                  content: ratingMessage,
                  error: ratingResult.error || 'unknown',
                  function_name: 'session-reminder/rating',
                });
              } catch (logErr) {
                console.warn(`⚠️ Could not log failed rating for session ${session.id}:`, logErr);
              }
            }

            // Mark post_session_sent and rating_requested atomically
            await supabase
              .from('sessions')
              .update({ 
                post_session_sent: true,
                ...(ratingSuccess && { rating_requested: true })
              })
              .eq('id', session.id);
            
            postSessionSent++;
            console.log(`✅ Post-session complete for session ${session.id} (rating: ${ratingSuccess})`);
          }
        } catch (sendError) {
          console.error(`❌ Error sending post-session summary for session ${session.id}:`, sendError);
        }
      }
    }

    console.log(`📊 Session reminders completed: ${reminders24hSent} 24h, ${reminders5mSent} 5m, ${sessionStartsSent} starts, ${missedSessionsClosed} missed, ${abandonedSessionsClosed} abandoned, ${postSessionSent} post-session`);

    return new Response(JSON.stringify({ 
      success: true,
      reminders_24h_sent: reminders24hSent,
      reminders_5m_sent: reminders5mSent,
      session_starts_sent: sessionStartsSent,
      missed_sessions_closed: missedSessionsClosed,
      abandoned_sessions_closed: abandonedSessionsClosed,
      post_session_sent: postSessionSent,
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
