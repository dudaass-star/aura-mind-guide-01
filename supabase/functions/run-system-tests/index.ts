import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  duration_ms: number;
  details: any;
  validations: { check: string; passed: boolean; detail?: string }[];
}

const AVAILABLE_TESTS = ['casual', 'emotional', 'session_part1', 'session_part2', 'report', 'checkin', 'followup'];

// Helper: extract reply from aura-agent response
function extractReply(data: any): string {
  return (data.messages || []).map((m: any) => m.text).join(' ||| ') || '';
}

// ========== TEST: Casual Conversation ==========
async function testCasualConversation(supabaseUrl: string, serviceKey: string, testUserId: string): Promise<TestResult> {
  const start = Date.now();
  const validations: TestResult['validations'] = [];
  const responses: string[] = [];

  const casualMessages = [
    "Oi Aura, tudo bem?",
    "Hoje tô de boa, fui fazer mercado",
    "Comprei umas frutas e verduras, tentando comer melhor",
    "E depois vou assistir um filme",
    "Alguma sugestão de filme?"
  ];

  try {
    for (const msg of casualMessages) {
      const res = await fetch(`${supabaseUrl}/functions/v1/aura-agent`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: testUserId,
          message: msg,
          phone: 'test-simulation',
        }),
      });

      if (!res.ok) {
        validations.push({ check: `Response for "${msg}"`, passed: false, detail: `HTTP ${res.status}` });
        continue;
      }

      const data = await res.json();
      const reply = extractReply(data);
      responses.push(reply);

      validations.push({
        check: `Response not empty for "${msg.substring(0, 30)}..."`,
        passed: reply.length > 0,
        detail: reply.length > 0 ? `${reply.length} chars` : 'Empty response',
      });

      if (reply.length > 0) {
        validations.push({
          check: `Response under 500 chars`,
          passed: reply.length < 500,
          detail: `${reply.length} chars`,
        });

        const hasSessionTag = /\[ENCERRAR_SESSAO\]|\[CONVERSA_CONCLUIDA\]|\[INICIAR_SESSAO\]/i.test(reply);
        validations.push({
          check: `No session tags in casual`,
          passed: !hasSessionTag,
          detail: hasSessionTag ? 'Session tag found in casual conversation!' : 'Clean',
        });
      }
    }

    // NEW: Validate informal Brazilian tone across all responses
    const allReplies = responses.join(' ').toLowerCase();
    const informalMarkers = ['que legal', 'massa', 'top', 'demais', 'haha', 'rs', 'kkk', 'tô', 'tá', 'pra', 'né', 'tbm', 'aí', 'acho', 'cara', 'gente', 'show', 'bora', 'curtir', 'bacana'];
    const informalCount = informalMarkers.filter(m => allReplies.includes(m)).length;
    validations.push({
      check: 'Tom informal brasileiro',
      passed: informalCount >= 2,
      detail: `${informalCount} marcadores encontrados`,
    });

    // NEW: Validate return questions (Aura should ask questions back in casual chat)
    const questionsCount = responses.filter(r => r.includes('?')).length;
    validations.push({
      check: 'Perguntas de retorno (engajamento)',
      passed: questionsCount >= 1,
      detail: `${questionsCount}/${responses.length} respostas com pergunta`,
    });

    // NEW: No prohibited disclaimers in casual
    const hasDisclaimer = /sou apenas uma ia|não sou psicólog|sou uma inteligência artificial|minhas capacidades são limitadas/i.test(allReplies);
    validations.push({
      check: 'Sem disclaimers proibidos',
      passed: !hasDisclaimer,
      detail: hasDisclaimer ? 'Disclaimer encontrado!' : 'Limpo',
    });

    const allPassed = validations.every(v => v.passed);
    const failCount = validations.filter(v => !v.passed).length;
    return {
      name: 'Conversa Casual',
      status: allPassed ? 'pass' : failCount <= 2 ? 'warning' : 'fail',
      duration_ms: Date.now() - start,
      details: { responses },
      validations,
    };
  } catch (error) {
    return {
      name: 'Conversa Casual',
      status: 'fail',
      duration_ms: Date.now() - start,
      details: { error: String(error) },
      validations,
    };
  }
}

// ========== TEST: Emotional Conversation ==========
async function testEmotionalConversation(supabaseUrl: string, serviceKey: string, testUserId: string): Promise<TestResult> {
  const start = Date.now();
  const validations: TestResult['validations'] = [];
  const responses: string[] = [];

  const emotionalMessages = [
    "Aura, tô me sentindo muito mal hoje",
    "Sinto que ninguém me entende, tô sozinha",
    "Tô tão cansada de tudo, não consigo ver saída pra isso",
    "Desculpa, tô exagerando... é que tá difícil",
  ];

  try {
    for (const msg of emotionalMessages) {
      const res = await fetch(`${supabaseUrl}/functions/v1/aura-agent`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: testUserId,
          message: msg,
          phone: 'test-simulation',
        }),
      });

      if (!res.ok) {
        validations.push({ check: `Response for emotional msg`, passed: false, detail: `HTTP ${res.status}` });
        continue;
      }

      const data = await res.json();
      const reply = extractReply(data);
      responses.push(reply);

      validations.push({
        check: `Response not empty for emotional msg`,
        passed: reply.length > 0,
      });

      const hasDisclaimer = /sou apenas uma ia|não sou psicólog|sou uma inteligência artificial|minhas capacidades são limitadas/i.test(reply);
      validations.push({
        check: `No prohibited disclaimers`,
        passed: !hasDisclaimer,
        detail: hasDisclaimer ? 'Disclaimer found!' : 'Clean',
      });
    }

    // Validate emotional support in the intense message response (3rd message)
    const intenseResponse = responses[2] || '';
    const empathyWords = ['entendo', 'aqui', 'sentir', 'difícil', 'dificil', 'lado', 'cuidar', 'sozinha', 'acolh', 'escut', 'importa', 'sinto', 'comigo', 'presente', 'força', 'forca', 'válid', 'valid'];
    const hasEmpathy = empathyWords.some(w => intenseResponse.toLowerCase().includes(w));
    validations.push({
      check: 'Acolhimento na mensagem intensa (3ª)',
      passed: hasEmpathy,
      detail: hasEmpathy ? 'Empatia detectada' : 'Sem palavras de empatia',
    });

    // NEW: Validate 4th response doesn't invalidate feelings
    const fourthResponse = (responses[3] || '').toLowerCase();
    if (fourthResponse.length > 0) {
      const invalidatingWords = ['exagero', 'exagerando', 'não é pra tanto', 'nao e pra tanto', 'drama', 'dramática'];
      const hasInvalidation = invalidatingWords.some(w => fourthResponse.includes(w));
      const validatingWords = ['válid', 'valid', 'normal', 'faz sentido', 'direito de sentir', 'natural', 'compreensível', 'compreensivel', 'legítim', 'legitim'];
      const hasValidation = validatingWords.some(w => fourthResponse.includes(w));
      validations.push({
        check: 'Não invalida sentimento (4ª resposta)',
        passed: !hasInvalidation,
        detail: hasInvalidation ? 'Invalidação detectada!' : 'Sem invalidação',
      });
      validations.push({
        check: 'Valida sentimento (4ª resposta)',
        passed: hasValidation,
        detail: hasValidation ? 'Validação presente' : 'Sem palavras de validação',
      });
    }

    // NEW: Validate response length (50-600 chars for emotional responses)
    const emotionalLengths = responses.filter(r => r.length > 0);
    const lengthOk = emotionalLengths.every(r => r.length >= 50 && r.length <= 600);
    const tooShort = emotionalLengths.filter(r => r.length < 50).length;
    const tooLong = emotionalLengths.filter(r => r.length > 600).length;
    validations.push({
      check: 'Tamanho adequado (50-600 chars)',
      passed: lengthOk,
      detail: lengthOk ? 'Todas dentro do range' : `${tooShort} curtas demais, ${tooLong} longas demais`,
    });

    const failCount = validations.filter(v => !v.passed).length;
    return {
      name: 'Conversa Emocional',
      status: failCount === 0 ? 'pass' : failCount <= 2 ? 'warning' : 'fail',
      duration_ms: Date.now() - start,
      details: { responses },
      validations,
    };
  } catch (error) {
    return {
      name: 'Conversa Emocional',
      status: 'fail',
      duration_ms: Date.now() - start,
      details: { error: String(error) },
      validations,
    };
  }
}

// ========== TEST: Session Part 1 (abertura + exploração) ==========
async function testSessionPart1(supabaseUrl: string, serviceKey: string, testUserId: string): Promise<TestResult> {
  const start = Date.now();
  const validations: TestResult['validations'] = [];
  const conversationLog: { phase: string; sent: string; received: string; elapsed_min: number }[] = [];

  const supabase = createClient(supabaseUrl, serviceKey);

  const sessionScript = [
    {
      phase: 'abertura',
      minuteOffset: 0,
      messages: [
        "Oi Aura, tô aqui pra sessão",
        "Tô bem, um pouco ansiosa com o trabalho",
      ],
    },
    {
      phase: 'exploracao',
      minuteOffset: 8,
      messages: [
        "É que meu chefe tá me cobrando muito e eu não sei como lidar",
        "Sinto que nunca é suficiente, sabe? Faço tudo e parece que nunca tá bom",
        "Talvez tenha a ver com meu pai, ele sempre cobrava demais de mim",
      ],
    },
  ];

  try {
    const sessionStartTime = new Date(Date.now() - 45 * 60 * 1000);
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        user_id: testUserId,
        session_type: 'livre',
        scheduled_at: sessionStartTime.toISOString(),
        started_at: sessionStartTime.toISOString(),
        status: 'in_progress',
        duration_minutes: 45,
      })
      .select()
      .single();

    if (sessionError || !session) {
      return {
        name: 'Sessão Parte 1 (Abertura+Exploração)',
        status: 'fail',
        duration_ms: Date.now() - start,
        details: { error: `Failed to create test session: ${sessionError?.message}` },
        validations: [{ check: 'Create test session', passed: false, detail: sessionError?.message }],
      };
    }

    await supabase
      .from('profiles')
      .update({ current_session_id: session.id })
      .eq('user_id', testUserId);

    validations.push({ check: 'Test session created', passed: true, detail: session.id });

    for (const group of sessionScript) {
      const simulatedStartTime = new Date(Date.now() - (45 - group.minuteOffset) * 60 * 1000);
      await supabase
        .from('sessions')
        .update({ started_at: simulatedStartTime.toISOString() })
        .eq('id', session.id);

      for (const msg of group.messages) {
        const res = await fetch(`${supabaseUrl}/functions/v1/aura-agent`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: testUserId,
            message: msg,
            phone: 'test-simulation',
          }),
        });

        let reply = '';
        if (res.ok) {
          const data = await res.json();
          reply = extractReply(data);
        }

        conversationLog.push({
          phase: group.phase,
          sent: msg,
          received: reply,
          elapsed_min: group.minuteOffset,
        });

        validations.push({
          check: `[${group.phase}] Response not empty`,
          passed: reply.length > 0,
          detail: `${reply.substring(0, 100)}...`,
        });
      }
    }

    // NEW: Validate exploratory questions in exploration phase
    const explorationReplies = conversationLog.filter(l => l.phase === 'exploracao').map(l => l.received);
    const explorationQuestions = explorationReplies.filter(r => r.includes('?')).length;
    validations.push({
      check: 'Perguntas exploratórias na exploração',
      passed: explorationQuestions >= 1,
      detail: `${explorationQuestions}/${explorationReplies.length} respostas com pergunta`,
    });

    // NEW: No premature advice in exploration phase
    const allExplorationText = explorationReplies.join(' ').toLowerCase();
    const prematureAdvice = ['você deveria', 'voce deveria', 'tente fazer', 'minha sugestão', 'minha sugestao', 'sugiro que', 'recomendo que'];
    const hasPrematureAdvice = prematureAdvice.some(p => allExplorationText.includes(p));
    validations.push({
      check: 'Sem conselhos prematuros na exploração',
      passed: !hasPrematureAdvice,
      detail: hasPrematureAdvice ? 'Conselho prematuro detectado!' : 'Exploração sem aconselhamento prematuro',
    });

    const failCount = validations.filter(v => !v.passed).length;
    return {
      name: 'Sessão Parte 1 (Abertura+Exploração)',
      status: failCount === 0 ? 'pass' : failCount <= 2 ? 'warning' : 'fail',
      duration_ms: Date.now() - start,
      details: { conversationLog, session_id: session.id },
      validations,
    };
  } catch (error) {
    try {
      const supabase = createClient(supabaseUrl, serviceKey);
      await supabase.from('profiles').update({ current_session_id: null }).eq('user_id', testUserId);
    } catch {}
    return {
      name: 'Sessão Parte 1 (Abertura+Exploração)',
      status: 'fail',
      duration_ms: Date.now() - start,
      details: { error: String(error) },
      validations,
    };
  }
}

// ========== TEST: Session Part 2 (reframe + encerramento + validações + cleanup) ==========
async function testSessionPart2(supabaseUrl: string, serviceKey: string, testUserId: string, sessionId: string): Promise<TestResult> {
  const start = Date.now();
  const validations: TestResult['validations'] = [];
  const conversationLog: { phase: string; sent: string; received: string; elapsed_min: number }[] = [];

  const supabase = createClient(supabaseUrl, serviceKey);

  const sessionScript = [
    {
      phase: 'reframe',
      minuteOffset: 25,
      messages: [
        "Faz sentido... nunca tinha pensado por esse ângulo",
        "Acho que posso tentar me cobrar menos e aceitar que tá bom o suficiente",
      ],
    },
    {
      phase: 'encerramento',
      minuteOffset: 44,
      messages: [
        "Vou tentar essa semana falar com ele",
        "Obrigada, Aura! Foi muito boa a sessão",
      ],
    },
  ];

  try {
    // Verify session exists
    const { data: existingSession } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('id', sessionId)
      .single();

    if (!existingSession) {
      return {
        name: 'Sessão Parte 2 (Reframe+Encerramento)',
        status: 'fail',
        duration_ms: Date.now() - start,
        details: { error: `Session ${sessionId} not found` },
        validations: [{ check: 'Session exists', passed: false, detail: `Session ${sessionId} not found` }],
      };
    }

    validations.push({ check: 'Session exists from part 1', passed: true, detail: sessionId });

    for (const group of sessionScript) {
      const simulatedStartTime = new Date(Date.now() - (45 - group.minuteOffset) * 60 * 1000);
      await supabase
        .from('sessions')
        .update({ started_at: simulatedStartTime.toISOString() })
        .eq('id', sessionId);

      for (const msg of group.messages) {
        const res = await fetch(`${supabaseUrl}/functions/v1/aura-agent`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: testUserId,
            message: msg,
            phone: 'test-simulation',
          }),
        });

        let reply = '';
        if (res.ok) {
          const data = await res.json();
          reply = extractReply(data);
        }

        conversationLog.push({
          phase: group.phase,
          sent: msg,
          received: reply,
          elapsed_min: group.minuteOffset,
        });

        validations.push({
          check: `[${group.phase}] Response not empty`,
          passed: reply.length > 0,
          detail: `${reply.substring(0, 100)}...`,
        });
      }
    }

    // NEW: Validate reframe quality
    const reframeReplies = conversationLog.filter(l => l.phase === 'reframe').map(l => l.received);
    const allReframeText = reframeReplies.join(' ').toLowerCase();
    const reframeKeywords = ['perspectiva', 'olhar', 'ângulo', 'angulo', 'possibilidade', 'pensar de outra forma', 'refletir', 'reflexão', 'reflexao', 'diferente', 'nova forma', 'outro lado', 'ponto de vista', 'nova maneira', 'outra forma de ver', 'ressignificar', 'transformar', 'mudar o olhar', 'enxergar', 'perceber', 'repensar', 'considerar', 'interessante'];
    const hasReframe = reframeKeywords.some(k => allReframeText.includes(k));
    validations.push({
      check: 'Nova perspectiva no reframe',
      passed: hasReframe,
      detail: hasReframe ? 'Reframe com nova perspectiva' : 'Sem palavras de reframe detectadas',
    });

    // NEW: Validate closing summary/recognition
    const closingRepliesText = conversationLog.filter(l => l.phase === 'encerramento').map(l => l.received).join(' ').toLowerCase();
    const closingKeywords = ['caminhamos', 'exploramos', 'importante', 'coragem', 'passo', 'progresso', 'conquista', 'evolução', 'evolucao', 'reflexão', 'reflexao', 'descoberta', 'percebeu', 'perceber', 'crescimento', 'bonito', 'orgulho', 'avanço', 'avanco', 'lindo', 'especial', 'processo', 'jornada', 'significativo', 'trabalhamos', 'compartilhou', 'força', 'forca'];
    const hasClosingSummary = closingKeywords.some(k => closingRepliesText.includes(k));
    validations.push({
      check: 'Reconhecimento de progresso no encerramento',
      passed: hasClosingSummary,
      detail: hasClosingSummary ? 'Reconhecimento presente' : 'Sem reconhecimento de progresso',
    });

    // Post-session validations
    const { data: finalSession } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    const isCompleted = finalSession?.status === 'completed';
    validations.push({
      check: 'Session status is completed',
      passed: isCompleted,
      detail: `Status: ${finalSession?.status}`,
    });

    const hasSummary = !!finalSession?.session_summary && finalSession.session_summary.length > 10;
    validations.push({
      check: 'Session summary generated',
      passed: hasSummary,
      detail: hasSummary ? `${finalSession.session_summary.substring(0, 100)}...` : 'No summary',
    });

    const hasInsights = Array.isArray(finalSession?.key_insights) && (finalSession.key_insights as any[]).length > 0;
    validations.push({
      check: 'Key insights generated',
      passed: hasInsights,
      detail: `${(finalSession?.key_insights as any[] || []).length} insights`,
    });

    const hasCommitments = Array.isArray(finalSession?.commitments) && (finalSession.commitments as any[]).length > 0;
    validations.push({
      check: 'Commitments generated',
      passed: hasCommitments,
      detail: `${(finalSession?.commitments as any[] || []).length} commitments`,
    });

    const { data: profileAfter } = await supabase
      .from('profiles')
      .select('current_session_id')
      .eq('user_id', testUserId)
      .single();

    const sessionCleared = !profileAfter?.current_session_id;
    validations.push({
      check: 'current_session_id cleared after session',
      passed: sessionCleared,
      detail: sessionCleared ? 'Cleared' : `Still set: ${profileAfter?.current_session_id}`,
    });

    const closingResponses = conversationLog.filter(l => l.phase === 'encerramento');
    const anyClosingTag = closingResponses.some(l =>
      /\[ENCERRAR_SESSAO\]|\[CONVERSA_CONCLUIDA\]/i.test(l.received)
    );
    validations.push({
      check: 'Closing tags in encerramento phase',
      passed: anyClosingTag || isCompleted,
      detail: anyClosingTag ? 'Tags found' : (isCompleted ? 'Session completed (tags may be stripped)' : 'No closing tags'),
    });

    // Cleanup
    await supabase.from('sessions').delete().eq('id', sessionId);
    await supabase.from('profiles').update({ current_session_id: null }).eq('user_id', testUserId);
    const { data: testMsgs } = await supabase
      .from('messages')
      .select('id')
      .eq('user_id', testUserId)
      .order('created_at', { ascending: false })
      .limit(25);
    if (testMsgs && testMsgs.length > 0) {
      await supabase.from('messages').delete().in('id', testMsgs.map(m => m.id));
    }

    validations.push({ check: 'Test data cleaned up', passed: true });

    const failCount = validations.filter(v => !v.passed).length;
    return {
      name: 'Sessão Parte 2 (Reframe+Encerramento)',
      status: failCount === 0 ? 'pass' : failCount <= 2 ? 'warning' : 'fail',
      duration_ms: Date.now() - start,
      details: { conversationLog },
      validations,
    };
  } catch (error) {
    try {
      await supabase.from('profiles').update({ current_session_id: null }).eq('user_id', testUserId);
      if (sessionId) await supabase.from('sessions').delete().eq('id', sessionId);
    } catch {}
    return {
      name: 'Sessão Parte 2 (Reframe+Encerramento)',
      status: 'fail',
      duration_ms: Date.now() - start,
      details: { error: String(error) },
      validations,
    };
  }
}

// ========== TEST: Weekly Report (dry_run) ==========
async function testWeeklyReport(supabaseUrl: string, serviceKey: string, testUserId: string): Promise<TestResult> {
  const start = Date.now();
  const validations: TestResult['validations'] = [];

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/weekly-report`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dry_run: true, target_user_id: testUserId }),
    });

    if (!res.ok) {
      return {
        name: 'Relatório Semanal',
        status: 'fail',
        duration_ms: Date.now() - start,
        details: { error: `HTTP ${res.status}` },
        validations: [{ check: 'HTTP response OK', passed: false }],
      };
    }

    const data = await res.json();
    validations.push({ check: 'Function returned successfully', passed: true });
    validations.push({ check: 'dry_run flag respected', passed: data.dry_run === true });

    const reports = data.reports || [];
    const hasReport = reports.length > 0;
    validations.push({
      check: 'Report generated for user',
      passed: hasReport,
      detail: hasReport ? `${reports.length} report(s)` : 'No reports',
    });

    if (hasReport) {
      const report = reports[0];
      const reportText = report.report || '';

      validations.push({
        check: 'Report has metrics section',
        passed: /📈|mensagen|insight|sess/i.test(reportText),
        detail: reportText.substring(0, 100),
      });

      validations.push({
        check: 'Report has proper formatting',
        passed: /━━━/.test(reportText) && /\*/.test(reportText),
        detail: 'Separators and bold markers present',
      });

      validations.push({
        check: 'Report is not too short',
        passed: reportText.length > 100,
        detail: `${reportText.length} chars`,
      });
    }

    const allPassed = validations.every(v => v.passed);
    return {
      name: 'Relatório Semanal',
      status: allPassed ? 'pass' : 'warning',
      duration_ms: Date.now() - start,
      details: { reports },
      validations,
    };
  } catch (error) {
    return {
      name: 'Relatório Semanal',
      status: 'fail',
      duration_ms: Date.now() - start,
      details: { error: String(error) },
      validations,
    };
  }
}

// ========== TEST: Scheduled Check-in (dry_run) ==========
async function testScheduledCheckin(supabaseUrl: string, serviceKey: string, testUserId: string): Promise<TestResult> {
  const start = Date.now();
  const validations: TestResult['validations'] = [];

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/scheduled-checkin`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dry_run: true, target_user_id: testUserId }),
    });

    if (!res.ok) {
      return {
        name: 'Check-in Agendado',
        status: 'fail',
        duration_ms: Date.now() - start,
        details: { error: `HTTP ${res.status}` },
        validations: [{ check: 'HTTP response OK', passed: false }],
      };
    }

    const data = await res.json();
    validations.push({ check: 'Function returned successfully', passed: true });
    validations.push({ check: 'dry_run flag respected', passed: data.dry_run === true });

    const messages = data.messages || [];
    const hasMessage = messages.length > 0;
    validations.push({
      check: 'Check-in message generated',
      passed: hasMessage,
      detail: hasMessage ? messages[0]?.message?.substring(0, 80) : 'No messages',
    });

    if (hasMessage) {
      const msg = messages[0].message;
      validations.push({
        check: 'Message has greeting',
        passed: /bom dia|boa tarde|boa noite/i.test(msg),
      });
      validations.push({
        check: 'Message is not too long',
        passed: msg.length < 300,
        detail: `${msg.length} chars`,
      });

      // NEW: Validate personalization with user name
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data: profile } = await supabase.from('profiles').select('name').eq('user_id', testUserId).single();
      const userName = profile?.name || '';
      if (userName && userName !== 'Test User') {
        const hasName = msg.toLowerCase().includes(userName.toLowerCase());
        validations.push({
          check: 'Usa nome do usuário',
          passed: hasName,
          detail: hasName ? `Nome "${userName}" encontrado` : `Nome "${userName}" não usado`,
        });
      }

      // NEW: Validate not generic
      const genericPatterns = /^(bom dia|boa tarde|boa noite),?\s*(como (você está|vai|está)\??)\s*$/i;
      const isGeneric = genericPatterns.test(msg.trim());
      validations.push({
        check: 'Mensagem não genérica',
        passed: !isGeneric,
        detail: isGeneric ? 'Mensagem muito genérica!' : 'Personalizada',
      });
    }

    const allPassed = validations.every(v => v.passed);
    return {
      name: 'Check-in Agendado',
      status: allPassed ? 'pass' : 'warning',
      duration_ms: Date.now() - start,
      details: { messages },
      validations,
    };
  } catch (error) {
    return {
      name: 'Check-in Agendado',
      status: 'fail',
      duration_ms: Date.now() - start,
      details: { error: String(error) },
      validations,
    };
  }
}

// ========== TEST: Conversation Follow-up (dry_run) ==========
async function testConversationFollowup(supabaseUrl: string, serviceKey: string): Promise<TestResult> {
  const start = Date.now();
  const validations: TestResult['validations'] = [];

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/conversation-followup`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dry_run: true }),
    });

    if (!res.ok) {
      return {
        name: 'Follow-up de Conversa',
        status: 'fail',
        duration_ms: Date.now() - start,
        details: { error: `HTTP ${res.status}` },
        validations: [{ check: 'HTTP response OK', passed: false }],
      };
    }

    const data = await res.json();
    validations.push({ check: 'Function returned successfully', passed: true });

    if (data.status === 'skipped' && data.reason === 'quiet_hours') {
      validations.push({ check: 'Quiet hours respected (but bypassed in dry_run)', passed: true });
    }

    validations.push({
      check: 'Response has expected fields',
      passed: data.totalConversations !== undefined || data.status === 'skipped',
      detail: `conversations: ${data.totalConversations}, sent: ${data.followupsSent}`,
    });

    if (data.followups && data.followups.length > 0) {
      validations.push({
        check: 'Follow-up messages generated',
        passed: true,
        detail: `${data.followups.length} follow-ups`,
      });

      for (const fu of data.followups.slice(0, 3)) {
        const isGeneric = /como você está|tudo bem|como vai/i.test(fu.message);
        validations.push({
          check: `Follow-up for ${fu.name || fu.user_id} is contextual`,
          passed: !isGeneric,
          detail: fu.message?.substring(0, 80),
        });
      }
    } else {
      validations.push({
        check: 'Follow-up check completed (no eligible users)',
        passed: true,
        detail: 'No users needed follow-up at this time',
      });
    }

    const allPassed = validations.every(v => v.passed);
    return {
      name: 'Follow-up de Conversa',
      status: allPassed ? 'pass' : 'warning',
      duration_ms: Date.now() - start,
      details: data,
      validations,
    };
  } catch (error) {
    return {
      name: 'Follow-up de Conversa',
      status: 'fail',
      duration_ms: Date.now() - start,
      details: { error: String(error) },
      validations,
    };
  }
}

// ========== AI VERDICT ==========
async function generateVerdict(results: TestResult[]): Promise<{ verdict: string; suggestions: string[] }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    const allPassed = results.every(r => r.status === 'pass');
    return {
      verdict: allPassed ? '✅ Todos os testes passaram!' : '⚠️ Alguns testes falharam.',
      suggestions: results.filter(r => r.status !== 'pass').map(r => `Verificar: ${r.name}`),
    };
  }

  try {
    const summary = results.map(r => ({
      name: r.name,
      status: r.status,
      duration_ms: r.duration_ms,
      failed_checks: r.validations.filter(v => !v.passed).map(v => ({ check: v.check, detail: v.detail })),
      sample_responses: r.details?.responses?.slice(0, 3) || r.details?.conversationLog?.slice(0, 5)?.map((l: any) => `[${l.phase}] User: ${l.sent} → Aura: ${l.received?.substring(0, 150)}`) || [],
    }));

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Você é um avaliador de qualidade do sistema AURA (coach de vida via WhatsApp). Analise os resultados dos testes automatizados e gere:

1. Um VEREDICTO claro: "✅ Tudo OK — sistema funcionando bem" ou "⚠️ Atenção — melhorias necessárias"
2. Uma lista de SUGESTÕES ESPECÍFICAS de melhoria (se houver)

Critérios de avaliação:
- Tom informal brasileiro: deve usar contrações (tô, tá, pra, né), ser acolhedora e natural, sem robolês
- Tamanho: respostas curtas para conversa casual, mais densas para sessão (50-600 chars para emocional)
- Sessão completa: fases devem progredir naturalmente (abertura→exploração→reframe→encerramento)
- Perguntas exploratórias: na exploração, Aura deve fazer perguntas, não dar conselhos prematuros
- Reframe: deve oferecer nova perspectiva com palavras como "perspectiva", "olhar", "possibilidade"
- Encerramento: deve reconhecer o progresso da sessão
- Acolhimento emocional: deve progredir, validar sentimentos, nunca invalidar ("exagero", "não é pra tanto")
- Disclaimers proibidos: nunca dizer "sou apenas uma IA"
- Relatórios: devem ter métricas e análise personalizada
- Check-in: deve ser personalizado com nome do usuário, não genérico
- Follow-ups: devem ser contextuais, não genéricos

Seja direto e objetivo. Máximo 5 sugestões.`
          },
          {
            role: 'user',
            content: JSON.stringify(summary, null, 2),
          },
        ],
        max_tokens: 500,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      const lines = content.split('\n').filter((l: string) => l.trim());
      const verdict = lines[0] || '⚠️ Análise inconclusiva';
      const suggestions = lines
        .slice(1)
        .filter((l: string) => /^[-•\d]/.test(l.trim()))
        .map((l: string) => l.replace(/^[-•\d.)\s]+/, '').trim())
        .filter((s: string) => s.length > 10);

      return { verdict, suggestions };
    }
  } catch (error) {
    console.error('Error generating verdict:', error);
  }

  const allPassed = results.every(r => r.status === 'pass');
  return {
    verdict: allPassed ? '✅ Todos os testes passaram!' : '⚠️ Alguns testes precisam de atenção.',
    suggestions: results.filter(r => r.status !== 'pass').map(r => `Revisar: ${r.name}`),
  };
}

// ========== SETUP: Get or create test user ==========
async function getTestUser(supabase: any, testUserId: string | null) {
  if (!testUserId) {
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .single();

    if (!adminRole) {
      throw new Error('No admin user found. Pass user_id in body.');
    }
    testUserId = adminRole.user_id;
  }

  let createdTempProfile = false;
  let { data: testProfile } = await supabase
    .from('profiles')
    .select('user_id, name, phone, current_session_id')
    .eq('user_id', testUserId)
    .single();

  if (!testProfile) {
    console.log('⚠️ No profile found for test user, creating temporary profile...');
    const { data: newProfile, error: insertErr } = await supabase
      .from('profiles')
      .insert({ user_id: testUserId, name: 'Test User', phone: 'test-simulation', status: 'active' })
      .select('user_id, name, phone, current_session_id')
      .single();

    if (insertErr || !newProfile) {
      throw new Error('Failed to create temp profile: ' + (insertErr?.message || 'unknown'));
    }
    testProfile = newProfile;
    createdTempProfile = true;
  }

  if (testProfile.current_session_id) {
    await supabase.from('profiles').update({ current_session_id: null }).eq('user_id', testUserId);
  }

  return { testUserId: testUserId!, testProfile, createdTempProfile };
}

// ========== MAIN ==========
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let testUserId: string | null = null;
    let testName: string | null = null;
    let verdictResults: TestResult[] | null = null;
    let sessionId: string | null = null;

    try {
      const body = await req.json();
      testUserId = body?.user_id || null;
      testName = body?.test || null;
      verdictResults = body?.results || null;
      sessionId = body?.session_id || null;
    } catch {}

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // If no test specified, return available tests
    if (!testName) {
      return new Response(JSON.stringify({
        available_tests: AVAILABLE_TESTS,
        usage: 'Pass { "test": "casual" } to run a single test. Pass { "test": "verdict", "results": [...] } to generate verdict.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verdict mode
    if (testName === 'verdict') {
      if (!verdictResults || !Array.isArray(verdictResults)) {
        return new Response(JSON.stringify({ error: 'Pass results array in body for verdict' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log('🤖 Generating AI verdict...');
      const { verdict, suggestions } = await generateVerdict(verdictResults);

      const totalDuration = verdictResults.reduce((sum, r) => sum + r.duration_ms, 0);
      const passCount = verdictResults.filter(r => r.status === 'pass').length;
      const failCount = verdictResults.filter(r => r.status === 'fail').length;
      const warnCount = verdictResults.filter(r => r.status === 'warning').length;

      return new Response(JSON.stringify({
        status: 'success',
        summary: {
          total: verdictResults.length,
          pass: passCount,
          fail: failCount,
          warning: warnCount,
          total_duration_ms: totalDuration,
        },
        verdict,
        suggestions,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Single test mode
    if (!AVAILABLE_TESTS.includes(testName)) {
      return new Response(JSON.stringify({ error: `Unknown test: ${testName}. Available: ${AVAILABLE_TESTS.join(', ')}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { testUserId: resolvedUserId, createdTempProfile } = await getTestUser(supabase, testUserId);
    console.log(`🧪 Running test "${testName}" for user ${resolvedUserId}`);

    let result: TestResult;

    switch (testName) {
      case 'casual':
        result = await testCasualConversation(supabaseUrl, serviceKey, resolvedUserId);
        break;
      case 'emotional':
        result = await testEmotionalConversation(supabaseUrl, serviceKey, resolvedUserId);
        break;
      case 'session_part1':
        result = await testSessionPart1(supabaseUrl, serviceKey, resolvedUserId);
        break;
      case 'session_part2':
        if (!sessionId) {
          result = { name: 'Sessão Parte 2', status: 'fail', duration_ms: 0, details: { error: 'session_id is required for session_part2' }, validations: [{ check: 'session_id provided', passed: false }] };
        } else {
          result = await testSessionPart2(supabaseUrl, serviceKey, resolvedUserId, sessionId);
        }
        break;
      case 'report':
        result = await testWeeklyReport(supabaseUrl, serviceKey, resolvedUserId);
        break;
      case 'checkin':
        result = await testScheduledCheckin(supabaseUrl, serviceKey, resolvedUserId);
        break;
      case 'followup':
        result = await testConversationFollowup(supabaseUrl, serviceKey);
        break;
      default:
        result = { name: 'Unknown', status: 'fail', duration_ms: 0, details: {}, validations: [] };
    }

    // Cleanup temp profile
    if (createdTempProfile) {
      console.log('🧹 Cleaning up temporary test profile...');
      await supabase.from('profiles').delete().eq('user_id', resolvedUserId);
    }

    console.log(`✅ Test "${testName}" complete: ${result.status} (${result.duration_ms}ms)`);

    return new Response(JSON.stringify({
      status: 'success',
      test: testName,
      result,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ System test error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
