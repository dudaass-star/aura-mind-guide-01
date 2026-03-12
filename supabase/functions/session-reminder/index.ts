import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { getInstanceConfigForUser, antiBurstDelay } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para gerar summary de sessão via IA quando sessão foi abandonada mas teve participação ativa
async function generateSessionSummaryFallback(
  supabase: any,
  session: any
): Promise<{ summary: string; key_insights: any[]; commitments: any[] }> {
  const fallback = {
    summary: 'Sessão encerrada automaticamente após período de inatividade. O usuário participou ativamente da conversa.',
    key_insights: [],
    commitments: [],
  };

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) return fallback;

    // Buscar mensagens da sessão
    const { data: sessionMessages } = await supabase
      .from('messages')
      .select('content, role, created_at')
      .eq('user_id', session.user_id)
      .gte('created_at', session.started_at)
      .order('created_at', { ascending: true })
      .limit(50);

    if (!sessionMessages || sessionMessages.length < 3) return fallback;

    const conversationText = sessionMessages
      .map((m: any) => `${m.role === 'user' ? 'Usuário' : 'AURA'}: ${m.content.substring(0, 400)}`)
      .join('\n');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        tools: [
          {
            type: 'function',
            function: {
              name: 'session_summary',
              description: 'Gerar resumo estruturado da sessão terapêutica',
              parameters: {
                type: 'object',
                properties: {
                  summary: {
                    type: 'string',
                    description: 'Resumo da sessão em 2-3 frases (máx 200 chars)'
                  },
                  key_insights: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Até 3 insights principais da sessão'
                  },
                  commitments: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' }
                      },
                      required: ['title']
                    },
                    description: 'Compromissos assumidos pelo usuário (se houver)'
                  }
                },
                required: ['summary', 'key_insights', 'commitments'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'session_summary' } },
        messages: [
          {
            role: 'system',
            content: `Você é uma psicóloga analisando uma sessão terapêutica que foi encerrada automaticamente (o usuário parou de responder).
Gere um resumo estruturado da sessão com base na conversa. Seja empática e precisa.`
          },
          {
            role: 'user',
            content: `Conversa da sessão:\n${conversationText}`
          }
        ],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        console.log('✨ Generated session summary fallback via AI');
        return {
          summary: parsed.summary || fallback.summary,
          key_insights: parsed.key_insights || [],
          commitments: parsed.commitments || [],
        };
      }
    }
  } catch (error) {
    console.error('⚠️ Error generating session summary fallback:', error);
  }

  return fallback;
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

    const now = new Date();
    const brtHour = getBrtHour();
    const isQuietHours = brtHour < 8 || brtHour >= 22;
    if (isQuietHours) {
      console.log(`🌙 Quiet hours (${brtHour}h BRT) - only time-sensitive reminders (1h, 15m, start, 10m) will be sent`);
    }
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
          .select('name, phone, whatsapp_instance_id')
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
          const instanceConfig = await getInstanceConfigForUser(supabase, session.user_id);
          const result = await sendTextMessage(cleanPhone, message, undefined, instanceConfig);

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
          .select('name, phone, whatsapp_instance_id')
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
          const instanceConfig = await getInstanceConfigForUser(supabase, session.user_id);
          const result = await sendTextMessage(cleanPhone, message, undefined, instanceConfig);

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
          .select('name, phone, whatsapp_instance_id')
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
          const instanceConfig = await getInstanceConfigForUser(supabase, session.user_id);
          const result = await sendTextMessage(cleanPhone, message, undefined, instanceConfig);

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
        if (sessions15m?.some(s => s.id === session.id) || 
            sessions1h?.some(s => s.id === session.id) || 
            sessions24h?.some(s => s.id === session.id)) {
          continue;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('name, phone, whatsapp_instance_id')
          .eq('user_id', session.user_id)
          .maybeSingle();

        if (!profile?.phone) {
          console.log(`⚠️ No phone for session to start ${session.id}`);
          continue;
        }

        const userName = profile.name || 'você';

        // NOVA MENSAGEM: Pede confirmação explícita para iniciar
        const message = `Oi, ${userName}! 💜 Chegou a hora da nossa sessão especial!

Esse é nosso momento de 45 minutos pra gente ir mais fundo, diferente das conversas do dia a dia.

Você está pronta(o) pra começar? Me responde um "vamos" ou "bora" quando quiser iniciar! ✨`;

        try {
          const cleanPhone = cleanPhoneNumber(profile.phone);
          const instanceConfig = await getInstanceConfigForUser(supabase, session.user_id);
          const result = await sendTextMessage(cleanPhone, message, undefined, instanceConfig);

          if (result.success) {
            // CORREÇÃO: APENAS marca como notificado, NÃO muda status para in_progress
            // O aura-agent irá mudar para in_progress quando o usuário responder com confirmação
            await supabase
              .from('sessions')
              .update({ 
                session_start_notified: true
                // REMOVIDO: status: 'in_progress' e started_at
                // Será feito pelo aura-agent quando usuário confirmar
              })
              .eq('id', session.id);
            
            sessionStartsSent++;
            console.log(`✅ Session start confirmation request sent for session ${session.id} - waiting for explicit user confirmation`);
          } else {
            console.error(`❌ Failed to send session start notification for ${session.id}:`, result.error);
          }
        } catch (sendError) {
          console.error(`❌ Error sending session start notification for ${session.id}:`, sendError);
        }
      }
    }

    // ========================================================================
    // LEMBRETE DE 10 MINUTOS - Para sessões notificadas mas não iniciadas
    // ========================================================================
    let reminder10mSent = 0;
    
    const { data: notifiedButNotStarted, error: errorNotStarted } = await supabase
      .from('sessions')
      .select('id, user_id, scheduled_at')
      .eq('status', 'scheduled')
      .eq('session_start_notified', true)
      .is('started_at', null);
    
    if (errorNotStarted) {
      console.error('❌ Error fetching notified but not started sessions:', errorNotStarted);
    }
    
    if (notifiedButNotStarted && notifiedButNotStarted.length > 0) {
      for (const session of notifiedButNotStarted) {
        const scheduledTime = new Date(session.scheduled_at);
        const minutesSinceScheduled = (now.getTime() - scheduledTime.getTime()) / 60000;
        
        // Se já passaram 15 minutos e sessão não iniciou, enviar lembrete gentil
        // Mas só entre 15 e 25 minutos para não enviar duplicado (era 10-15)
        if (minutesSinceScheduled >= 15 && minutesSinceScheduled < 25) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, phone, whatsapp_instance_id')
            .eq('user_id', session.user_id)
            .maybeSingle();
          
          if (!profile?.phone) continue;
          
          // NOVO: Verificar se o usuário mandou mensagem recente (pode estar conversando/avisou que vai demorar)
          const { data: recentUserMsg } = await supabase
            .from('messages')
            .select('created_at')
            .eq('user_id', session.user_id)
            .eq('role', 'user')
            .gte('created_at', scheduledTime.toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (recentUserMsg) {
            console.log(`⏭️ Skipping 10min reminder for session ${session.id}: user sent message after session notification`);
            continue;
          }
          
          const userName = profile.name || 'você';
          // MENSAGEM MAIS CLARA: Reforça que precisa de resposta para iniciar
          const reminderMessage = `Oi ${userName}! 💜 Ainda tô te esperando pra nossa sessão especial.

Pra gente começar, me manda um "vamos" ou "bora" - ou me avisa se quer reagendar pra outro momento, tá? ✨`;
          
          try {
            const cleanPhone = cleanPhoneNumber(profile.phone);
            const instanceConfig = await getInstanceConfigForUser(supabase, session.user_id);
            const result = await sendTextMessage(cleanPhone, reminderMessage, undefined, instanceConfig);
            
            if (result.success) {
              reminder10mSent++;
              console.log(`✅ 10min reminder sent for waiting session ${session.id}`);
            }
          } catch (sendError) {
            console.error(`❌ Error sending 10min reminder for session ${session.id}:`, sendError);
          }
        }
      }
    }

    // ========================================================================
    // DETECTAR SESSÕES NOTIFICADAS MAS NUNCA INICIADAS (missed - 30 min após notificação)
    // Skip during quiet hours - will be processed next run
    // ========================================================================
    let missedSessionsClosed = 0;
    
    const { data: missedSessions, error: errorMissed } = isQuietHours ? { data: null, error: null } : await supabase
      .from('sessions')
      .select('id, user_id, scheduled_at')
      .eq('status', 'scheduled')
      .eq('session_start_notified', true)
      .is('started_at', null)
      .lt('scheduled_at', thirtyMinutesAgo.toISOString()); // Agendada há mais de 30 min
    
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
            session_summary: 'Usuário não respondeu à notificação de início da sessão.'
          })
          .eq('id', session.id);
        
        // Enviar mensagem oferecendo reagendamento
        if (profile?.phone) {
          const userName = profile.name || 'você';
          const message = `Oi ${userName}! 💜

Parece que não conseguimos conectar pra sessão de hoje. Tudo bem, acontece!

Quer remarcar pra outro horário? É só me dizer quando fica bom pra você. ✨`;
          
          try {
            const cleanPhone = cleanPhoneNumber(profile.phone);
            const instanceConfig = await getInstanceConfigForUser(supabase, session.user_id);
            await sendTextMessage(cleanPhone, message, undefined, instanceConfig);
            console.log(`✅ Missed session message sent for session ${session.id}`);
          } catch (sendError) {
            console.error(`❌ Error sending missed session message for session ${session.id}:`, sendError);
          }
        }
        
        missedSessionsClosed++;
      }
    }

    // ========================================================================
    // DETECTAR E FECHAR SESSÕES ABANDONADAS (30 min após fim previsto)
    // CORREÇÃO: Diferenciar entre usuário que participou vs apenas recebeu abertura
    // Skip during quiet hours - will be processed next run
    // ========================================================================
    let abandonedSessionsClosed = 0;
    
    // Buscar sessões in_progress que deveriam ter terminado há mais de 30 minutos
    const { data: abandonedSessions, error: errorAbandoned } = isQuietHours ? { data: null, error: null } : await supabase
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
          const aiSummary = await generateSessionSummaryFallback(supabase, session);
          statusToSet = 'completed';
          summaryToSet = aiSummary.summary;
          messageToSend = `Oi ${userName}! 💜

Nossa sessão de hoje foi ótima, mesmo que tenha ficado em silêncio no final. Já salvei o resumo pra você!

Se quiser retomar de onde paramos ou agendar a próxima, é só me chamar. ✨`;

          // Salvar key_insights e commitments também
          await supabase
            .from('sessions')
            .update({
              key_insights: aiSummary.key_insights,
              commitments: aiSummary.commitments,
            })
            .eq('id', session.id);
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
            session_summary: summaryToSet
          })
          .eq('id', session.id);
        
        // Limpar current_session_id do profile
        await supabase
          .from('profiles')
          .update({ current_session_id: null })
          .eq('user_id', session.user_id);
        
        // Enviar mensagem de fechamento se tiver telefone
        if (profile?.phone) {
          try {
            const cleanPhone = cleanPhoneNumber(profile.phone);
            const instanceConfig = await getInstanceConfigForUser(supabase, session.user_id);
            await sendTextMessage(cleanPhone, messageToSend, undefined, instanceConfig);
            console.log(`✅ Closure message sent for session ${session.id}`);
          } catch (sendError) {
            console.error(`❌ Error sending closure message for session ${session.id}:`, sendError);
          }
        }
        
        abandonedSessionsClosed++;
      }
    }

    // ========================================================================
    // LEMBRETE PÓS-SESSÃO (fallback: 5 minutos após término se não foi enviado pelo aura-agent)
    // Skip during quiet hours - will be processed next run
    // ========================================================================
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const { data: completedSessions, error: errorCompleted } = isQuietHours ? { data: null, error: null } : await supabase
      .from('sessions')
      .select(`id, user_id, session_summary, commitments, key_insights, ended_at`)
      .eq('status', 'completed')
      .eq('post_session_sent', false)
      .not('session_summary', 'is', null)
      .lte('ended_at', fiveMinutesAgo.toISOString());

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
          console.log(`⚠️ No summary for completed session ${session.id}`);
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
          const instanceConfig = await getInstanceConfigForUser(supabase, session.user_id);
          const result = await sendTextMessage(cleanPhone, message, undefined, instanceConfig);

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

            const ratingResult = await sendTextMessage(cleanPhone, ratingMessage, undefined, instanceConfig);
            
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

    console.log(`📊 Session reminders completed: ${reminders24hSent} 24h, ${reminders1hSent} 1h, ${reminders15mSent} 15m, ${sessionStartsSent} starts, ${reminder10mSent} 10m reminders, ${missedSessionsClosed} missed, ${abandonedSessionsClosed} abandoned, ${postSessionSent} post-session`);

    return new Response(JSON.stringify({ 
      success: true,
      reminders_24h_sent: reminders24hSent,
      reminders_1h_sent: reminders1hSent,
      reminders_15m_sent: reminders15mSent,
      reminders_10m_sent: reminder10mSent,
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
