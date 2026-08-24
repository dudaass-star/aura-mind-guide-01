import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  cleanPhoneNumber,
  getPhoneVariations,
} from "../_shared/zapi-client.ts";
import { sendMessage, sendAudio, sendAudioUrl, type SendResult } from "../_shared/whatsapp-provider.ts";
import { getInstanceConfigForUser } from "../_shared/instance-helper.ts";
import { CLICK_DELIVERY_TITLES, prefixWithTitle } from "../_shared/whatsapp-official.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function logFailedMessage(
  supabase: any,
  userId: string | undefined,
  phone: string | undefined,
  content: string,
  error: string | undefined,
  functionName: string = 'process-webhook-message',
) {
  try {
    await supabase.from('failed_message_log').insert({
      user_id: userId,
      phone,
      content: content.substring(0, 2000),
      error,
      function_name: functionName,
    });
  } catch (e) {
    console.error('❌ Failed to log failed message:', e);
  }
}

async function createShortLink(url: string, phone: string): Promise<string | null> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-short-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ url, phone }),
    });
    const data = await response.json();
    if (response.ok && data.shortUrl) return data.shortUrl;
    return null;
  } catch { return null; }
}

async function transcribeAudio(audioUrl: string): Promise<string | null> {
  try {
    console.log('🎙️ Downloading audio from:', audioUrl);
    let audioBlob: Blob | null = null;

    // Branch Meta Cloud API: prefixo "meta-media:<media_id>" enviado pelo webhook-meta
    const metaMatch = audioUrl.match(/^meta-media:(.+)$/);
    if (metaMatch) {
      const mediaId = metaMatch[1];
      console.log(`🔐 Using Meta Graph API for media download (media_id=${mediaId})`);
      const { downloadMetaMedia } = await import("../_shared/meta-whatsapp-client.ts");
      audioBlob = await downloadMetaMedia(mediaId);
      if (!audioBlob) {
        console.error('❌ Meta media download failed');
        return null;
      }
      console.log('📦 Audio downloaded via Meta, size:', audioBlob.size, 'bytes');
    } else {
      // Branch Twilio (legado): URLs api.twilio.com via gateway autenticado
    // Twilio media URLs (api.twilio.com) são privadas e exigem autenticação.
    // Roteamos via connector gateway, que injeta as credenciais automaticamente
    // e prepende /2010-04-01/Accounts/{AccountSid}.
    let fetchUrl = audioUrl;
    let fetchHeaders: Record<string, string> = {};
    const twilioMatch = audioUrl.match(/api\.twilio\.com\/2010-04-01\/Accounts\/[^/]+(\/.+)$/);
    if (twilioMatch) {
      const lovableKey = Deno.env.get('LOVABLE_API_KEY');
      const twilioKey = Deno.env.get('TWILIO_API_KEY');
      if (lovableKey && twilioKey) {
        fetchUrl = `https://connector-gateway.lovable.dev/twilio${twilioMatch[1]}`;
        fetchHeaders = {
          'Authorization': `Bearer ${lovableKey}`,
          'X-Connection-Api-Key': twilioKey,
        };
        console.log('🔐 Using Twilio gateway for media download');
      } else {
        console.warn('⚠️ Twilio media URL detected but credentials missing');
      }
    }
    const audioResponse = await fetch(fetchUrl, { headers: fetchHeaders, redirect: 'follow' });
    if (!audioResponse.ok) {
      console.error('❌ Failed to download audio:', audioResponse.status);
      return null;
    }
      audioBlob = await audioResponse.blob();
    console.log('📦 Audio downloaded, size:', audioBlob.size, 'bytes');
    }

    const formData = new FormData();
    formData.append('file', audioBlob!, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY not configured');
      return null;
    }

    console.log('🔄 Sending to Whisper API...');
    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('❌ Whisper API error:', errorText);
      return null;
    }

    const result = await whisperResponse.json();
    console.log('✅ Transcription result:', result.text);
    return result.text;
  } catch (error) {
    console.error('❌ Error transcribing audio:', error);
    return null;
  }
}

async function generateTTS(text: string, userId?: string): Promise<{ audioUrl: string | null; audioContent: string | null }> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const response = await fetch(`${supabaseUrl}/functions/v1/aura-tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ text, userId, voice: 'shimmer' }),
    });
    if (!response.ok) {
      console.error('❌ TTS error:', await response.text());
      return { audioUrl: null, audioContent: null };
    }
    const data = await response.json();
    return { audioUrl: data.audioUrl ?? null, audioContent: data.audioContent ?? null };
  } catch (error) {
    console.error('❌ TTS exception:', error);
    return { audioUrl: null, audioContent: null };
  }
}

// ============================================================================
// QUOTED MESSAGE — Busca o conteúdo da mensagem citada (reply nativo do WhatsApp)
// ----------------------------------------------------------------------------
// Quando o usuário usa o "Responder" do WhatsApp citando uma mensagem anterior
// da AURA, o Twilio envia o SID em `OriginalRepliedMessageSid`. O body da
// mensagem citada não vem no webhook, então precisamos buscá-lo via Twilio API.
// ============================================================================
async function fetchTwilioQuotedBody(messageSid: string): Promise<string | null> {
  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
    if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
      console.warn('⚠️ [QUOTED] Twilio gateway credentials missing, cannot fetch quoted body');
      return null;
    }
    const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';
    const resp = await fetch(`${GATEWAY_URL}/Messages/${messageSid}.json`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWILIO_API_KEY,
      },
    });
    if (!resp.ok) {
      console.warn(`⚠️ [QUOTED] Twilio API ${resp.status} for SID ${messageSid}`);
      return null;
    }
    const data = await resp.json();
    const body: string | undefined = data?.body;
    if (!body) return null;
    return body.trim();
  } catch (err) {
    console.warn('⚠️ [QUOTED] fetchTwilioQuotedBody failed:', err);
    return null;
  }
}

async function handleSessionConfirmation(
  supabase: any, userId: string, message: string
): Promise<{ handled: boolean; response?: string }> {
  const { data: pendingSession } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .eq('confirmation_requested', true)
    .is('user_confirmed', null)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pendingSession) return { handled: false };

  const lowerMessage = message.toLowerCase().trim();

  if (/^(sim|confirmo|confirmado|ok|pode ser|tá bom|ta bom|certo|fechado|confirma|confirmei)$/i.test(lowerMessage)) {
    await supabase.from('sessions').update({ user_confirmed: true }).eq('id', pendingSession.id);

    // PRÉ-ARME: marca pending_insight com [SESSION_PREARM] para que QUALQUER mensagem
    // do usuário próxima ao horário agendado dispare o início imediato da sessão,
    // mesmo que o cron de T-5min atrase ou falhe ao enviar o template.
    // Só sobrescreve pending_insight se ele estiver vazio (não atropela INSIGHT/WELCOME pendente).
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('pending_insight')
        .eq('user_id', userId)
        .maybeSingle();
      if (!prof?.pending_insight) {
        await supabase
          .from('profiles')
          .update({ pending_insight: `[SESSION_PREARM]${pendingSession.id}` })
          .eq('user_id', userId);
        console.log(`🎯 [SESSION_PREARM] Sessão ${pendingSession.id} pré-armada via confirmação T-24h`);
      } else {
        console.log(`⏭️ [SESSION_PREARM] Pulado — pending_insight já preenchido (${prof.pending_insight.substring(0, 30)}...)`);
      }
    } catch (e) {
      console.error('⚠️ [SESSION_PREARM] Falha ao pré-armar sessão:', e);
    }

    const sessionDate = new Date(pendingSession.scheduled_at);
    const sessionTime = sessionDate.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
    });
    return { handled: true, response: `Perfeito! Sessão confirmada para ${sessionTime}. Mal posso esperar! 💜` };
  }

  if (/reagendar|remarcar|outro|mudar|não (posso|consigo|dá)|nao (posso|consigo|da)|cancelar/i.test(lowerMessage)) {
    return { handled: false };
  }

  return { handled: false };
}

async function handleSessionRating(
  supabase: any, userId: string, message: string
): Promise<{ handled: boolean; response?: string }> {
  const lowerMessage = message.toLowerCase().trim();
  // Aceita escala 1-5 (avaliação da sessão).
  // Padrões aceitos: "5", "5!", "nota 4", "5 obrigada", "5/5", "dou 4"
  // Rejeita números soltos no meio de frases longas (>40 chars sem contexto de nota)
  let rating: number | null = null;
  // Aceita "5", "5 ⭐", "⭐ 5", "5/5", "nota 4", "dou 4 estrelas", etc.
  const standalone = lowerMessage.match(/^[⭐\s]*([1-5])\b/);
  const withContext = lowerMessage.match(/\b(?:nota|dou|seria|acho|talvez|uns?|daria|dei)\s+([1-5])\b/);
  const slashFormat = lowerMessage.match(/^[⭐\s]*([1-5])\s*\/\s*5\b/);
  const starSuffix = lowerMessage.match(/^([1-5])\s*⭐/);
  if (standalone && lowerMessage.length <= 80) rating = parseInt(standalone[1]);
  else if (slashFormat) rating = parseInt(slashFormat[1]);
  else if (starSuffix) rating = parseInt(starSuffix[1]);
  else if (withContext) rating = parseInt(withContext[1]);
  if (rating === null || rating < 1 || rating > 5) return { handled: false };

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: ratedSession } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .eq('rating_requested', true)
    .gte('ended_at', oneDayAgo)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ratedSession) return { handled: false };

  const { data: existingRating } = await supabase
    .from('session_ratings').select('id').eq('session_id', ratedSession.id).maybeSingle();
  if (existingRating) return { handled: false };

  const { error: insertError } = await supabase
    .from('session_ratings').insert({ session_id: ratedSession.id, user_id: userId, rating });
  if (insertError) { console.error('❌ Error saving session rating:', insertError); return { handled: false }; }

  // Resposta proporcional à avaliação da sessão (1-5)
  let response: string;
  if (rating >= 5) response = `Que bom saber! 💜 Fico feliz que a sessão tenha feito sentido pra você.`;
  else if (rating >= 4) response = `Obrigada pela nota! 💜 Se tiver algo que poderia ter sido melhor, me conta — eu escuto.`;
  else if (rating >= 3) response = `Recebido, obrigada pela honestidade. 💜 Me conta o que faltou — quero melhorar pra você.`;
  else response = `Obrigada por me dizer. 💜 Quero entender o que não funcionou — me conta com suas palavras quando puder.`;

  console.log(`✅ Session rating saved: ${rating}/5 for session ${ratedSession.id}`);
  return { handled: true, response };
}

// ============================================================================
// MAIN WORKER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ========================================================================
  // AUTHENTICATION — Only accept internal calls
  // ========================================================================
  const internalSecret = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('INTERNAL_WEBHOOK_SECRET');

  if (!internalSecret || !expectedSecret || internalSecret !== expectedSecret) {
    console.warn('🚫 Unauthorized request to process-webhook-message');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Track phone for contingency — no longer sends fallback messages
  let contingencyPhone: string | null = null;
  let sentAnyResponse = false;
  let supabase: ReturnType<typeof createClient> | null = null;
  let profile: any = null;
  let wasInterrupted = false;
  let interruptedAtIndex = -1;
  let agentData: any = null;

  try {
    const workerPayload = await req.json();
    const {
      phone, cleanPhone, messageId, text,
      hasAudio, audioUrl, hasImage, imageCaption,
      // Metadados de clique de botão (Twilio Quick Reply)
      messageType, buttonText, buttonPayload, originalRepliedMessageSid,
      // Identificador da mensagem citada via "Responder" nativo do WhatsApp (Meta)
      quotedMessageId,
    } = workerPayload;

    contingencyPhone = cleanPhone;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // PROCESS MESSAGE CONTENT
    // ========================================================================
    let messageText = text;
    let isAudioMessage = false;

    if (hasAudio && !messageText) {
      console.log('🎤 Audio message detected, transcribing...');
      const transcription = await transcribeAudio(audioUrl);
      if (transcription) {
        messageText = transcription;
        isAudioMessage = true;
        console.log('✅ Audio transcribed:', messageText);
      }
    }

    if (hasImage && imageCaption) {
      messageText = imageCaption;
      console.log('🖼️ Image with caption:', messageText);
    }

    // ========================================================================
    // USER LOOKUP
    // ========================================================================
    const phoneVariations = getPhoneVariations(cleanPhone);
    console.log(`🔍 Searching for phone variations: ${phoneVariations.join(', ')}`);

    const { data: profileResults, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .in('phone', phoneVariations)
      .order('status', { ascending: true })
      .order('updated_at', { ascending: false })
      .limit(1);

    if (profileError) {
      console.error('❌ Error looking up profile:', profileError);
      return new Response(JSON.stringify({ status: 'profile_lookup_error' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    profile = profileResults?.[0];
    if (!profile) {
      console.log('⚠️ User not found for phone variations:', phoneVariations.join(', '));
      return new Response(JSON.stringify({ status: 'user_not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get instance config for legacy reference
    try {
      await getInstanceConfigForUser(supabase, profile.user_id);
    } catch {}

    // Auto-correção de telefone
    if (profile.phone !== cleanPhone) {
      console.log(`📱 Auto-correcting phone: ${profile.phone} -> ${cleanPhone}`);
      await supabase.from('profiles').update({ phone: cleanPhone }).eq('id', profile.id);
      profile.phone = cleanPhone;
    }

    console.log(`👤 Found user: ${profile.name} (${profile.user_id}), status: ${profile.status}, instance: ${profile.whatsapp_instance_id || 'env-default'}`);

    // ========================================================================
    // TRIAL EXPIRATION — handled by Stripe webhook, NOT inline.
    //
    // Bug fixed 2026-04-22: previous inline rule expired ANY profile with
    // status='trial' and trial_started_at older than 5 days. This wrongly
    // affected paid users (paid trials, monthly subs whose status='trial' had
    // never been promoted to 'active' due to webhook race conditions, etc.),
    // mass-expiring 15 paying customers on 2026-04-22.
    //
    // Source of truth for paid users: stripe-webhook (sub.status →
    // active/past_due/canceled). Inline expiration removed entirely.
    // ========================================================================

    // ========================================================================
    // SUBSCRIPTION STATUS CHECK
    // ========================================================================
    // trial_expired with trial_started_at = Stripe trial user, do NOT block (webhook will convert them)
    const isLegitTrial = profile.status === 'trial_expired' && !!profile.trial_started_at;
    const blockedStatuses = ['canceled', 'inactive', 'paused', 'trial_expired'];
    if (blockedStatuses.includes(profile.status || '') && !isLegitTrial) {
      console.log(`🚫 User ${profile.user_id} blocked: status is '${profile.status}'`);

      try {
        // Persiste a mensagem do usuário no histórico ANTES de qualquer envio
        if (messageText) {
          await supabase.from('messages').insert({
            user_id: profile.user_id,
            role: 'user',
            content: messageText,
          });
        }

        // Rate-limit reativo: 1 winback a cada 7 dias por usuário
        // (evita spam se o cliente cancelado mandar várias mensagens seguidas)
        const lastReactive = (profile as any).last_winback_reactive_sent_at
          ? new Date((profile as any).last_winback_reactive_sent_at).getTime()
          : 0;
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        const withinRateLimit = lastReactive > 0 && (Date.now() - lastReactive) < sevenDaysMs;

        if (withinRateLimit) {
          console.log(`⏸️ Skipping reactive winback for ${profile.user_id}: sent ${Math.round((Date.now() - lastReactive) / 1000 / 3600)}h ago`);
          return new Response(JSON.stringify({ success: true, action: 'subscription_blocked_rate_limited', status: profile.status }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        let blockMessage: string;
        if (profile.status === 'trial_expired') {
          blockMessage = `Oi, ${profile.name || 'querido(a)'}! 💜\n\nSeu período de experiência terminou, mas não precisa ser um adeus.\n\nPra continuar conversando comigo, é só escolher o plano que faz sentido pra você:\n👉 https://olaaura.com.br/checkout\n\nTô aqui te esperando. ✨`;
        } else {
          // Tenta short link com try/catch e fallback para o link canônico
          let checkoutLink = 'https://olaaura.com.br/checkout';
          try {
            console.log(`🔗 [winback-reactive] creating short link for ${cleanPhone}`);
            const short = await createShortLink('https://olaaura.com.br/checkout', cleanPhone || '');
            if (short) checkoutLink = short;
            console.log(`🔗 [winback-reactive] link resolved: ${checkoutLink}`);
          } catch (linkErr) {
            console.error(`⚠️ [winback-reactive] createShortLink threw, using fallback:`, linkErr);
          }

          if (profile.status === 'canceled') {
            // Copy segmentada por motivo do cancelamento
            if ((profile as any).payment_failed_at) {
              // Dunning: foco prático em atualizar pagamento
              blockMessage = `Oi, ${profile.name || 'querido(a)'}! 💜\n\nSeu pagamento não passou e sua assinatura acabou sendo encerrada.\n\nSe quiser voltar, é só atualizar o cartão por aqui:\n👉 ${checkoutLink}\n\nQualquer coisa eu tô por aqui. ✨`;
            } else {
              // Cancelamento ativo: foco afetivo
              blockMessage = `Oi, ${profile.name || 'querido(a)'}! 💜\n\nQue bom te ver por aqui. Sua assinatura tá encerrada, mas se quiser voltar a conversar comigo é só reativar:\n👉 ${checkoutLink}\n\nTô aqui te esperando. ✨`;
            }
          } else if (profile.status === 'inactive') {
            blockMessage = `Oi, ${profile.name || 'querido(a)'}! 💜\n\nSua conta tá inativa no momento.\n\nPra continuarmos nossas conversas, é só assinar um plano:\n👉 ${checkoutLink}\n\nEstou aqui te esperando! ✨`;
          } else {
            blockMessage = `Oi, ${profile.name || 'querido(a)'}! 💜\n\nSua assinatura tá pausada no momento.\n\nQuando estiver pronto(a) pra voltar, é só reativar:\n👉 ${checkoutLink}\n\nEstarei aqui quando você precisar! ✨`;
          }
        }

        console.log(`📤 [winback-reactive] sending message to ${cleanPhone}`);
        const blockResult = await sendMessage(cleanPhone!, blockMessage);
        console.log(`📤 [winback-reactive] sendMessage result: success=${blockResult.success}`);

        if (!blockResult.success) {
          console.error(`❌ Failed to send block message: ${blockResult.error}`);
          await logFailedMessage(supabase, profile.user_id, cleanPhone, blockMessage, blockResult.error, 'process-webhook-message:subscription_blocked');
        } else {
          // Persiste resposta da Aura no histórico
          await supabase.from('messages').insert({
            user_id: profile.user_id,
            role: 'assistant',
            content: blockMessage,
          });
          // Marca rate-limit
          await supabase
            .from('profiles')
            .update({ last_winback_reactive_sent_at: new Date().toISOString() })
            .eq('id', profile.id);
        }

        return new Response(JSON.stringify({ success: true, action: 'subscription_blocked', status: profile.status }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (blockErr) {
        console.error(`❌ [winback-reactive] uncaught error in subscription_blocked branch:`, blockErr);
        await logFailedMessage(
          supabase,
          profile.user_id,
          cleanPhone,
          `[uncaught] ${messageText || ''}`,
          (blockErr as Error)?.message || String(blockErr),
          'process-webhook-message:subscription_blocked',
        );
        return new Response(JSON.stringify({ success: false, action: 'subscription_blocked_error', status: profile.status }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ========================================================================
    // INTERRUPTION SYSTEM
    // ========================================================================
    const currentMessageId = messageId || `msg_${Date.now()}`;

    // ========================================================================
    // ENTREGA DETERMINÍSTICA DE CONTEÚDO RICO (clique em template Quick Reply)
    //
    // Twilio envia em cada clique de botão:
    //   MessageType = "button"
    //   ButtonText  = texto exato do botão clicado (ex: "Ver pergunta", "Acessar")
    //   OriginalRepliedMessageSid = SID da mensagem-template clicada
    //
    // Fluxo:
    //   1. Se MessageType !== 'button' → segue fluxo normal (aura-agent).
    //   2. Se for botão:
    //      a) Lookup em template_definitions por button_text (case-insensitive)
    //         para descobrir delivers_content_type ('weekly_question' | 'monthly_letter').
    //      b) Lookup do registro em weekly_questions / monthly_letters cujo
    //         trigger_message_sid == OriginalRepliedMessageSid.
    //         Fallback: registro mais recente do usuário ainda não entregue
    //         (≤ 24h) — cobre cliques em templates antigos sem trigger_message_sid.
    //      c) Entrega o conteúdo (texto livre), marca delivered_at, libera lock,
    //         e RETORNA — não chamamos o aura-agent porque clique é comando, não conversa.
    //      d) Se algo falhar (template_definitions sem match, registro inexistente),
    //         cai pro fluxo normal — a Aura responde como se fosse texto.
    // ========================================================================
    const isButtonClick = messageType === 'button' && buttonText && originalRepliedMessageSid;
    if (isButtonClick) {
      try {
        console.log(`🔘 [BUTTON] Click detectado — text="${buttonText}" originalSid="${originalRepliedMessageSid}"`);

        // a) Resolver o tipo de conteúdo via template_definitions
        const { data: templateDef } = await supabase
          .from('template_definitions')
          .select('template_name, delivers_content_type, button_text')
          .ilike('button_text', buttonText.trim())
          .eq('is_active', true)
          .maybeSingle();

        if (!templateDef) {
          console.warn(`⚠️ [BUTTON] Sem template_definition para button_text="${buttonText}". Caindo no fluxo normal.`);
        } else {
          const contentType = templateDef.delivers_content_type;
          console.log(`🎯 [BUTTON] Template "${templateDef.template_name}" entrega "${contentType}"`);

          // b) Buscar o registro pendente. Match primário por trigger_message_sid;
          //    fallback por janela de 24h se SID não bater (templates legados).
          const ONE_DAY_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          let deliveryDone = false;

          if (contentType === 'monthly_letter') {
            let { data: rec } = await supabase
              .from('monthly_letters')
              .select('id, preview_text')
              .eq('user_id', profile.user_id)
              .eq('trigger_message_sid', originalRepliedMessageSid)
              .is('delivered_at', null)
              .maybeSingle();

            if (!rec) {
              const { data: fb } = await supabase
                .from('monthly_letters')
                .select('id, preview_text')
                .eq('user_id', profile.user_id)
                .is('delivered_at', null)
                .not('trigger_sent_at', 'is', null)
                .gte('trigger_sent_at', ONE_DAY_AGO)
                .order('trigger_sent_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              if (fb) {
                console.log(`↪️ [BUTTON] Fallback monthly_letter por janela (id=${fb.id}) — SID não casou`);
                rec = fb;
              }
            }

            if (rec?.id && rec.preview_text) {
              const { data: claimed } = await supabase
                .from('monthly_letters')
                .update({ delivered_at: new Date().toISOString() })
                .eq('id', rec.id)
                .is('delivered_at', null)
                .select('id')
                .maybeSingle();

              if (claimed) {
                const titledLetter = prefixWithTitle(CLICK_DELIVERY_TITLES.monthly_letter, rec.preview_text);
                const sendResult = await sendMessage(cleanPhone, titledLetter, profile.user_id);
                if (!sendResult.success) {
                  await supabase.from('monthly_letters').update({ delivered_at: null }).eq('id', rec.id);
                  console.warn(`⚠️ [BUTTON] Falha envio Carta Mensal (${rec.id}): ${sendResult.error}`);
                } else {
                  // Persiste como mensagem assistant pra Aura ter o contexto
                  // da carta ao processar a próxima resposta livre do usuário.
                  await supabase.from('messages').insert({
                    user_id: profile.user_id,
                    role: 'assistant',
                    content: titledLetter,
                  });
                  console.log(`💌 [BUTTON] Preview Carta Mensal entregue (id=${rec.id})`);
                  deliveryDone = true;
                }
              }
            } else {
              console.warn(`⚠️ [BUTTON] Nenhuma monthly_letter pendente encontrada para user ${profile.user_id}`);
            }
          } else {
            console.warn(`⚠️ [BUTTON] delivers_content_type desconhecido: "${contentType}"`);
          }

          // d) Se entregou, encerra aqui — clique de botão é comando, não conversa.
          if (deliveryDone) {
            return new Response(
              JSON.stringify({ status: 'delivered', content_type: contentType }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
          // Se não entregou, cai pro fluxo normal (Aura responde como se fosse texto).
        }

        // ====================================================================
        // FALLBACK DETERMINÍSTICO POR pending_insight
        // --------------------------------------------------------------------
        // Cobre Jornadas (`[CONTENT]<teaser+link>`) e Resumo Semanal
        // (`[WEEKLY_REPORT]<teaser+link>`). Esses fluxos disparam um template
        // (jornada_disponivel / aura_weekly_report_v2) e gravam o teaser em
        // profiles.pending_insight. Quando o usuário clica no botão do
        // template, MessageType === 'button' chega aqui — entregamos o
        // conteúdo gravado direto, sem chamar o aura-agent.
        //
        // Não precisamos de template_definitions porque o vínculo é o próprio
        // pending_insight: se ele existe + houve clique de botão, é entrega.
        // ====================================================================
        try {
          const pi = (profile as { pending_insight?: string | null }).pending_insight;
          if (pi && typeof pi === 'string') {
            let marker: '[CONTENT]' | '[WEEKLY_REPORT]' | null = null;
            if (pi.startsWith('[CONTENT]')) marker = '[CONTENT]';
            else if (pi.startsWith('[WEEKLY_REPORT]')) marker = '[WEEKLY_REPORT]';

            if (marker) {
              const directContent = pi.replace(marker, '').trim();
              if (directContent.length > 0) {
                const title = marker === '[CONTENT]'
                  ? CLICK_DELIVERY_TITLES.content
                  : CLICK_DELIVERY_TITLES.weekly_report;
                const titledContent = prefixWithTitle(title, directContent);
                const sendResult = await sendMessage(cleanPhone, titledContent, profile.user_id);
                if (sendResult.success) {
                  await Promise.all([
                    supabase.from('messages').insert({
                      user_id: profile.user_id,
                      role: 'assistant',
                      content: titledContent,
                    }),
                    supabase.from('profiles').update({
                      pending_insight: null,
                      last_content_sent_at: new Date().toISOString(),
                    }).eq('id', profile.id),
                    supabase.from('aura_response_state').update({
                      is_responding: false,
                      pending_content: null,
                      pending_context: null,
                    }).eq('user_id', profile.user_id),
                  ]);
                  console.log(`⚡ [BUTTON-FALLBACK] Entregou ${marker} via pending_insight (${directContent.length} chars) — pulando aura-agent`);
                  return new Response(
                    JSON.stringify({ status: 'delivered', content_type: marker, source: 'pending_insight' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
                  );
                } else {
                  console.warn(`⚠️ [BUTTON-FALLBACK] Falha enviando ${marker}: ${sendResult.error} — caindo no fluxo normal`);
                }
              }
            }
          }
        } catch (fbErr) {
          console.error('❌ [BUTTON-FALLBACK] Erro entregando pending_insight:', fbErr);
        }
      } catch (btnErr) {
        console.error('❌ [BUTTON] Erro no handler determinístico (caindo no fluxo normal):', btnErr);
      }
    }

    // Ensure row exists for atomic lock
    const { error: upsertError } = await supabase
      .from('aura_response_state')
      .upsert({ user_id: profile.user_id, updated_at: new Date().toISOString() }, { onConflict: 'user_id', ignoreDuplicates: true });

    if (upsertError) {
      console.error(`❌ Lock upsert FAILED for user ${profile.user_id}:`, upsertError.message);
    } else {
      console.log(`🔒 Lock upsert OK for user ${profile.user_id}`);
    }

    // ATOMIC LOCK: single UPDATE that only succeeds if is_responding = false
    const { data: lockResult } = await supabase
      .from('aura_response_state')
      .update({
        is_responding: true,
        response_started_at: new Date().toISOString(),
        last_user_message_id: currentMessageId
      })
      .eq('user_id', profile.user_id)
      .eq('is_responding', false)
      .select();

    if (!lockResult || lockResult.length === 0) {
      // Lock not acquired — check if stale (>60s)
      const { data: currentState } = await supabase
        .from('aura_response_state')
        .select('response_started_at')
        .eq('user_id', profile.user_id)
        .maybeSingle();

      const respondingAge = Date.now() - new Date(currentState?.response_started_at || 0).getTime();

      if (respondingAge < 60000) {
        // PERSIST message BEFORE aborting so the winning worker can accumulate it
        if (messageText) {
          const { data: recentDup } = await supabase
            .from('messages').select('id').eq('user_id', profile.user_id).eq('role', 'user')
            .eq('content', messageText).gte('created_at', new Date(Date.now() - 30000).toISOString())
            .limit(1).maybeSingle();
          if (!recentDup) {
            await supabase.from('messages').insert({ user_id: profile.user_id, role: 'user', content: messageText });
            console.log(`💾 Pre-lock: persisted message for accumulation by winning worker`);
          }
        }
        console.log(`🛑 ABORT: Lock atômico — outro worker respondendo (age: ${Math.round(respondingAge / 1000)}s). Mensagem será acumulada.`);
        return new Response(JSON.stringify({ status: 'debounced_concurrent', reason: 'another_worker_responding' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Stale lock — force acquisition
      console.log(`⚠️ Lock stale (${Math.round(respondingAge / 1000)}s), forçando aquisição`);
      await supabase.from('aura_response_state')
        .update({ is_responding: true, response_started_at: new Date().toISOString(), last_user_message_id: currentMessageId })
        .eq('user_id', profile.user_id);
    }

    // Helper to release lock on early returns
    const releaseLock = async () => {
      try {
        await supabase
          .from('aura_response_state')
          .update({ is_responding: false })
          .eq('user_id', profile.user_id);
      } catch (e) {
        console.error(`⚠️ Erro ao liberar lock para user ${profile.user_id}:`, e);
      }
    };

    try { // try/finally covers ALL code after lock acquisition to guarantee lock release

    // Read pending content from lock result or fresh query
    const responseState = lockResult?.[0] || (await supabase.from('aura_response_state').select('*').eq('user_id', profile.user_id).maybeSingle()).data;
    const pendingContent = responseState?.pending_content || null;
    const pendingContext = responseState?.pending_context || null;
    const lastUserContext = responseState?.last_user_context || null;

    if (pendingContent) {
      console.log(`📦 Found pending content from interrupted response: ${pendingContent.substring(0, 100)}...`);
    }

    // ========================================================================
    // PERSIST INBOUND MESSAGE (after lock — prevents duplicates from competing workers)
    // ========================================================================
    let inboundSaved = false;
    let inboundMessageCreatedAt: string | null = null;
    if (messageText) {
      // Content-based dedup: check for identical message in last 30s
      const { data: recentDup } = await supabase
        .from('messages')
        .select('id')
        .eq('user_id', profile.user_id)
        .eq('role', 'user')
        .eq('content', messageText)
        .gte('created_at', new Date(Date.now() - 30000).toISOString())
        .limit(1)
        .maybeSingle();

      if (recentDup) {
        console.log(`⏭️ DEDUP: Mensagem idêntica encontrada nos últimos 30s (id: ${recentDup.id}), abortando`);
        await releaseLock();
        return new Response(JSON.stringify({ status: 'ignored', reason: 'content_duplicate' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const { data: insertedMsg } = await supabase
          .from('messages')
          .insert({ user_id: profile.user_id, role: 'user', content: messageText })
          .select('id, created_at')
          .single();
        inboundSaved = true;
        inboundMessageCreatedAt = insertedMsg?.created_at ?? null;
        if (insertedMsg?.id) {
          (globalThis as any).__inboundMessageDbId = insertedMsg.id;
        }
        console.log(`💾 Inbound message persisted for user ${profile.user_id} (id: ${insertedMsg?.id})`);
      } catch (persistErr) {
        console.warn('⚠️ Failed to persist inbound message:', persistErr);
      }
    }

    // Incrementa trial_conversations_count para usuários que entraram no funil
    // (qualquer um com trial_started_at): cobre trial Stripe + ativos PIX,
    // que entram já como 'active' mas precisam aparecer em "Responderam".
    if (inboundSaved && profile.trial_started_at && ['trial', 'active'].includes(profile.status)) {
      try {
        await supabase
          .from('profiles')
          .update({ trial_conversations_count: (profile.trial_conversations_count || 0) + 1 })
          .eq('id', profile.id);
        console.log(`📊 Funnel reply counter incremented for ${profile.user_id} (${profile.status}): ${(profile.trial_conversations_count || 0) + 1}`);
      } catch (e) {
        console.warn('⚠️ Failed to increment funnel reply counter:', e);
      }
    }

    // ========================================================================
    // RESET FOLLOW-UP COUNT
    // ========================================================================
    await supabase
      .from('conversation_followups')
      .update({ followup_count: 0, last_user_message_at: new Date().toISOString() })
      .eq('user_id', profile.user_id);
    console.log(`🔄 Follow-up count reset for user ${profile.user_id}`);

    // ========================================================================
    // HANDLE FAILED AUDIO TRANSCRIPTION
    // ========================================================================
    if (hasAudio && !messageText) {
      console.log(`🎤 Audio transcription failed for user ${profile.user_id} — sending fallback and releasing lock`);
      
      await sendMessage(
        cleanPhone,
        "Desculpa, não consegui ouvir seu áudio direito. 😅 Pode me mandar por texto ou tentar gravar de novo?"
      );
      await releaseLock();
      return new Response(JSON.stringify({ status: 'audio_transcription_failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // PREFERÊNCIA DE CANAL (voz/texto) — detectada ANTES de qualquer handler
    // ------------------------------------------------------------------------
    // Motivo: o pedido "me responde por áudio" chegava e podia ser engolido por
    // outro estado (ex.: Cápsula do Tempo), fazendo a AURA prometer áudio e
    // entregar texto. Agora a preferência é persistida no perfil sempre, mesmo
    // que o turno seja encerrado por outro fluxo.
    // ========================================================================
    const channelPref = detectChannelPreference(messageText || '');
    if (channelPref) {
      await supabase.from('profiles').update({
        voice_mode: channelPref,
        voice_mode_set_at: new Date().toISOString(),
      }).eq('user_id', profile.user_id);
      profile.voice_mode = channelPref;
      profile.voice_mode_set_at = new Date().toISOString();
      console.log(`🎚️ voice_mode persistido: ${channelPref}`);
    }

    // ========================================================================
    // TIME CAPSULE HANDLING
    // ========================================================================
    let capsuleState = profile.awaiting_time_capsule;

    // Expiração determinística + saídas de segurança (roda ANTES dos handlers,
    // senão o bloco de timeout nunca é alcançado para os estados que prendem).
    if (capsuleState === 'awaiting_audio' || capsuleState === 'awaiting_confirmation') {
      const setAtRaw = profile.capsule_state_set_at;
      const setAt = setAtRaw ? new Date(setAtRaw).getTime() : null;
      const expired = setAt === null || (Date.now() - setAt) > 60 * 60 * 1000; // 1h
      const overCap = (profile.capsule_prompt_count || 0) >= 2;
      const escapeIntent = channelPref !== null;

      if (expired || overCap || escapeIntent) {
        console.log(`🚪 Cápsula abandonada (expired=${expired}, overCap=${overCap}, escapeIntent=${escapeIntent}) — seguindo fluxo normal`);
        await supabase.from('profiles').update({
          awaiting_time_capsule: null,
          pending_capsule_audio_url: null,
          capsule_state_set_at: null,
          capsule_prompt_count: 0,
        }).eq('user_id', profile.user_id);
        capsuleState = null;
      }
    }

    if (capsuleState === 'awaiting_audio' || capsuleState === 'awaiting_confirmation') {
      await supabase.from('profiles').update({
        capsule_prompt_count: (profile.capsule_prompt_count || 0) + 1,
      }).eq('user_id', profile.user_id);

      if (capsuleState === 'awaiting_audio') {
        if (hasAudio && audioUrl) {
          await supabase.from('profiles').update({
            awaiting_time_capsule: 'awaiting_confirmation',
            pending_capsule_audio_url: audioUrl,
            capsule_state_set_at: new Date().toISOString(),
            capsule_prompt_count: 0,
          }).eq('user_id', profile.user_id);

          const confirmMsg = `Recebi seu áudio! 🎙️ Ficou do jeito que você queria?\n\nSe quiser regravar, manda outro áudio. Se tiver bom, me diz "pode guardar" 💜`;
          await sendMessage(cleanPhone, confirmMsg);
          await supabase.from('messages').insert([
            ...(!inboundSaved ? [{ user_id: profile.user_id, role: 'user', content: messageText || '[áudio para cápsula do tempo]' }] : []),
            { user_id: profile.user_id, role: 'assistant', content: confirmMsg },
          ]);
          inboundSaved = true;
          await releaseLock();
          return new Response(JSON.stringify({ status: 'capsule_audio_received' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Check for cancellation intent before sending reminder
        const lowerMsgAudio = (messageText || '').toLowerCase().trim();
        if (/deixa|cancela|desist|não quero|nao quero|esquece|para|parar/i.test(lowerMsgAudio)) {
          await supabase.from('profiles').update({ awaiting_time_capsule: null, pending_capsule_audio_url: null, capsule_state_set_at: null, capsule_prompt_count: 0 }).eq('user_id', profile.user_id);
          const cancelMsg = `Tudo bem! Quando quiser gravar uma cápsula do tempo, é só falar 💜`;
          await sendMessage(cleanPhone, cancelMsg);
          await supabase.from('messages').insert([
            ...(!inboundSaved ? [{ user_id: profile.user_id, role: 'user', content: messageText }] : []),
            { user_id: profile.user_id, role: 'assistant', content: cancelMsg },
          ]);
          inboundSaved = true;
          await releaseLock();
          return new Response(JSON.stringify({ status: 'capsule_cancelled' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const reminderMsg = `Manda um áudio pra eu guardar sua voz! 🎙️ Quando quiser desistir, é só dizer "deixa pra lá" 💜`;
        await sendMessage(cleanPhone, reminderMsg);
        await supabase.from('messages').insert([
          ...(!inboundSaved ? [{ user_id: profile.user_id, role: 'user', content: messageText }] : []),
          { user_id: profile.user_id, role: 'assistant', content: reminderMsg },
        ]);
        inboundSaved = true;
        await releaseLock();
        return new Response(JSON.stringify({ status: 'capsule_awaiting_audio_reminder' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (capsuleState === 'awaiting_confirmation') {
        if (hasAudio && audioUrl) {
          await supabase.from('profiles').update({ pending_capsule_audio_url: audioUrl }).eq('user_id', profile.user_id);
          const replaceMsg = `Troquei o áudio! 🎙️ Esse ficou bom? Me diz "pode guardar" quando tiver certeza 💜`;
          await sendMessage(cleanPhone, replaceMsg);
          await supabase.from('messages').insert([
            ...(!inboundSaved ? [{ user_id: profile.user_id, role: 'user', content: messageText || '[novo áudio para cápsula]' }] : []),
            { user_id: profile.user_id, role: 'assistant', content: replaceMsg },
          ]);
          inboundSaved = true;
          await releaseLock();
          return new Response(JSON.stringify({ status: 'capsule_audio_replaced' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const lowerMsg = (messageText || '').toLowerCase().trim();

        if (/deixa|cancela|desist|não quero|nao quero|esquece|para|parar/i.test(lowerMsg)) {
          await supabase.from('profiles').update({ awaiting_time_capsule: null, pending_capsule_audio_url: null, capsule_state_set_at: null, capsule_prompt_count: 0 }).eq('user_id', profile.user_id);
          const cancelMsg = `Tudo bem! Quando quiser gravar uma cápsula do tempo, é só falar 💜`;
          await sendMessage(cleanPhone, cancelMsg);
          await supabase.from('messages').insert([
            ...(!inboundSaved ? [{ user_id: profile.user_id, role: 'user', content: messageText }] : []),
            { user_id: profile.user_id, role: 'assistant', content: cancelMsg },
          ]);
          inboundSaved = true;
          await releaseLock();
          return new Response(JSON.stringify({ status: 'capsule_cancelled' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (/sim|pode|guard|confirm|ficou|bom|bora|manda|salv|tá (bom|ótimo|perfeito)|ta (bom|otimo|perfeito)|perfeito|certeza|isso/i.test(lowerMsg)) {
          const pendingUrl = profile.pending_capsule_audio_url;
          if (!pendingUrl) {
            await supabase.from('profiles').update({ awaiting_time_capsule: null, pending_capsule_audio_url: null, capsule_state_set_at: null, capsule_prompt_count: 0 }).eq('user_id', profile.user_id);
          } else {
            const deliverAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
            let transcription: string | null = null;
            try { transcription = await transcribeAudio(pendingUrl); } catch (e) { console.warn('⚠️ Could not transcribe capsule audio:', e); }

            await supabase.from('time_capsules').insert({
              user_id: profile.user_id, audio_url: pendingUrl, transcription,
              deliver_at: deliverAt.toISOString(),
              context_message: `Cápsula gravada em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
            });
            await supabase.from('profiles').update({ awaiting_time_capsule: null, pending_capsule_audio_url: null, capsule_state_set_at: null, capsule_prompt_count: 0 }).eq('user_id', profile.user_id);

            const deliverDateStr = deliverAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
            const savedMsg = `Guardei sua mensagem com carinho! 💜✨\n\nVou te enviar de volta no dia ${deliverDateStr}. Vai ser uma surpresa especial do seu eu de hoje pro seu eu do futuro 🫶`;
            await sendMessage(cleanPhone, savedMsg);
            await supabase.from('messages').insert([
              ...(!inboundSaved ? [{ user_id: profile.user_id, role: 'user', content: messageText }] : []),
              { user_id: profile.user_id, role: 'assistant', content: savedMsg },
            ]);
            inboundSaved = true;
            console.log(`✅ Time capsule saved for user ${profile.user_id}, deliver_at: ${deliverDateStr}`);
            await releaseLock();
            return new Response(JSON.stringify({ status: 'capsule_saved' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        // Unrecognized response — clear capsule state, continue normal flow
        await supabase.from('profiles').update({ awaiting_time_capsule: null, pending_capsule_audio_url: null, capsule_state_set_at: null, capsule_prompt_count: 0 }).eq('user_id', profile.user_id);
        console.log('⚠️ Capsule confirmation state cleared - unrecognized response, continuing normal flow');
      }
    }

    // (O antigo timeout de 24h baseado em profile.updated_at foi removido:
    //  ficava DEPOIS dos returns dos estados que prendiam o usuário — código
    //  morto — e o campo era resetado por qualquer escrita no perfil.
    //  A expiração real de 1h agora roda ANTES dos handlers, acima.)

    // ========================================================================
    // SESSION RATING
    // ========================================================================
    const ratingResult = await handleSessionRating(supabase, profile.user_id, messageText);
    if (ratingResult.handled && ratingResult.response) {
      console.log(`✅ Session rating handled for user ${profile.user_id}`);
      
      await sendMessage(cleanPhone, ratingResult.response);
      if (!inboundSaved) {
        await supabase.from('messages').insert({ user_id: profile.user_id, role: 'user', content: messageText });
        inboundSaved = true;
      }
      await supabase.from('messages').insert({ user_id: profile.user_id, role: 'assistant', content: ratingResult.response });
      await releaseLock();
      return new Response(JSON.stringify({ status: 'rating_handled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // SESSION CONFIRMATION
    // ========================================================================
    const confirmationResult = await handleSessionConfirmation(supabase, profile.user_id, messageText);
    if (confirmationResult.handled && confirmationResult.response) {
      console.log(`✅ Session confirmation handled for user ${profile.user_id}`);
      
      await sendMessage(cleanPhone, confirmationResult.response);
      if (!inboundSaved) {
        await supabase.from('messages').insert({ user_id: profile.user_id, role: 'user', content: messageText });
        inboundSaved = true;
      }
      await supabase.from('messages').insert({ user_id: profile.user_id, role: 'assistant', content: confirmationResult.response });
      await releaseLock();
      return new Response(JSON.stringify({ status: 'confirmation_handled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // INITIAL DELAY — Simulates "reading" the message
    // ========================================================================
    const initialDelay = 1500 + Math.random() * 2000;
    console.log(`⏳ Initial thinking delay: ${Math.round(initialDelay)}ms`);
    await new Promise(resolve => setTimeout(resolve, initialDelay));

    // ========================================================================
    // DEBOUNCE REMOVIDO
    // ========================================================================
    // O bloco de debounce foi removido porque causava deadlock:
    // o Worker 1 (com lock) via a msg do Worker 2 no banco e se auto-abortava,
    // enquanto o Worker 2 já tinha abortado por não ter o lock.
    // A lógica de acumulação abaixo já resolve o caso de msgs sequenciais —
    // ela junta todas as msgs do usuário desde a última resposta da Aura.
    // O lock atômico garante que apenas 1 worker processa por vez.
    // ========================================================================

    // --- ACCUMULATE sequential user messages since last assistant response ---
    const { data: lastAssistantMsg } = await supabase
      .from('messages')
      .select('created_at')
      .eq('user_id', profile.user_id)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let accumulatedQuery = supabase
      .from('messages')
      .select('content, created_at')
      .eq('user_id', profile.user_id)
      .eq('role', 'user')
      .order('created_at', { ascending: true });

    if (lastAssistantMsg?.created_at) {
      accumulatedQuery = accumulatedQuery.gt('created_at', lastAssistantMsg.created_at);
    }

    const { data: recentUserMsgs } = await accumulatedQuery;

    if (recentUserMsgs && recentUserMsgs.length > 1) {
      messageText = recentUserMsgs.map(m => m.content).join('\n');
      inboundMessageCreatedAt = recentUserMsgs[recentUserMsgs.length - 1]?.created_at ?? inboundMessageCreatedAt;
      console.log(`📦 Accumulated ${recentUserMsgs.length} sequential messages into one`);
    }

    // ========================================================================
    // CALL AURA AGENT
    // ========================================================================
    console.log(`📱 Processing message from: ${cleanPhone.substring(0, 4)}***`);
    console.log(`💬 Message length: ${messageText.length} chars`);
    console.log(`🎤 Is audio message: ${isAudioMessage}`);

    // Lock already acquired atomically at line ~338

    // wasInterrupted, interruptedAtIndex, agentData declared at outer scope (line ~200)

    // ========================================================================
    // QUOTED MESSAGE — resolve o conteúdo da mensagem citada (reply nativo)
    // ------------------------------------------------------------------------
    // Quando o usuário usa "Responder" no WhatsApp citando uma mensagem da AURA,
    // o webhook recebe o SID (Twilio) ou wamid (Meta) da mensagem original. Aqui
    // buscamos o body via Twilio API e injetamos como `quoted_message` no
    // payload do aura-agent. Isso evita que a Aura assuma que o usuário está
    // respondendo à última mensagem dela quando, na verdade, está respondendo
    // a uma mensagem mais antiga.
    //
    // Pulamos esta resolução em cliques de botão (Quick Reply) — esses já têm
    // fast-path determinístico tratado antes deste ponto.
    // ========================================================================
    let quotedMessageBody: string | null = null;
    const isButtonClickReply = messageType === 'button';
    if (!isButtonClickReply && originalRepliedMessageSid) {
      console.log(`💬 [QUOTED] Twilio reply detected — fetching SID ${originalRepliedMessageSid}`);
      quotedMessageBody = await fetchTwilioQuotedBody(originalRepliedMessageSid);
      if (quotedMessageBody) {
        console.log(`💬 [QUOTED] Resolved body (${quotedMessageBody.length} chars): "${quotedMessageBody.substring(0, 80)}..."`);
      } else {
        console.log(`💬 [QUOTED] Could not resolve body for SID ${originalRepliedMessageSid}`);
      }
    }

    // ========================================================================
    // CONTEXTO PROATIVO desativado — Pergunta da Semana removida do produto.
    // ========================================================================
    const proactiveContext: { kind: string; question: string; minutesAgo: number } | null = null;

    // Helper: call aura-agent with timeout and optional minimal context
    async function callAuraAgent(useMinimalContext = false): Promise<any> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 50000); // 50s timeout
      try {
        const body: any = {
          message: messageText,
          user_id: profile.user_id,
          phone: cleanPhone,
          is_audio_message: isAudioMessage,
          pending_content: pendingContent,
          pending_context: pendingContext,
          last_user_context: lastUserContext,
          inbound_message_created_at: inboundMessageCreatedAt,
          // Conteúdo da mensagem citada via "Responder" nativo do WhatsApp
          quoted_message: quotedMessageBody,
          // Contexto de mensagem proativa recente (Pergunta da Semana, etc.)
          proactive_context: proactiveContext,
        };
        if (useMinimalContext) {
          body.minimal_context = true;
        }
        const resp = await fetch(`${supabaseUrl}/functions/v1/aura-agent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'X-Internal-Auth': Deno.env.get('INTERNAL_WEBHOOK_SECRET') ?? '',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!resp.ok) {
          const errorText = await resp.text();
          throw new Error(`Agent HTTP ${resp.status}: ${errorText}`);
        }
        return await resp.json();
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    }

    // RETRY STRATEGY: attempt 1 (normal) → attempt 2 (normal) → attempt 3 (minimal context)
    let lastError: any = null;
    console.log(`🚀 [INVOKE] aura-agent for user=${profile.user_id} phone=${cleanPhone.substring(0, 4)}*** msgLen=${messageText.length} pending_insight=${profile.pending_insight ? 'YES' : 'no'}`);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const useMinimal = attempt === 3;
        console.log(`🔄 aura-agent attempt ${attempt}/3${useMinimal ? ' (minimal_context)' : ''}...`);
        agentData = await callAuraAgent(useMinimal);
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        const isTimeout = err.name === 'AbortError';
        console.error(`❌ aura-agent attempt ${attempt} failed (${isTimeout ? 'TIMEOUT 50s' : err.message})`);
        if (attempt < 3) {
          console.log(`⏳ Waiting 2s before retry...`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    if (lastError || !agentData) {
      // Log estruturado para debug futuro de invocações que falham silenciosamente
      try {
        await supabase.from('failed_message_log').insert({
          user_id: profile.user_id,
          phone: cleanPhone,
          content: messageText.substring(0, 500),
          error: `aura-agent invoke failed after 3 attempts: ${lastError?.message || 'no agentData'}`,
          function_name: 'process-webhook-message',
        });
      } catch (logErr) {
        console.error('⚠️ Failed to write failed_message_log:', logErr);
      }
      throw lastError || new Error('All 3 aura-agent attempts failed');
    }

    // Clear pending content after passing to agent
    if (pendingContent) {
      await supabase.from('aura_response_state').update({ pending_content: null, pending_context: null }).eq('user_id', profile.user_id);
    }

    console.log('🤖 Agent response:', JSON.stringify(agentData, null, 2));

    // ========================================================================
    // RE-ACUMULAÇÃO PÓS-AGENTE
    // ========================================================================
    // Verifica se novas msgs do usuário chegaram enquanto o agente processava.
    // Se sim, re-acumula e re-chama o agente com o texto completo.
    // ========================================================================
    const { data: postAgentMsgs } = await supabase
      .from('messages')
      .select('content, created_at')
      .eq('user_id', profile.user_id)
      .eq('role', 'user')
      .gt('created_at', lastAssistantMsg?.created_at || '1970-01-01')
      .order('created_at', { ascending: true });

    if (postAgentMsgs && postAgentMsgs.length > (recentUserMsgs?.length || 1)) {
      const newAccumulatedText = postAgentMsgs.map(m => m.content).join('\n');
      if (newAccumulatedText !== messageText) {
        console.log(`📦 Re-acumulação: ${postAgentMsgs.length} msgs (antes: ${recentUserMsgs?.length || 1}). Re-chamando agente...`);
        messageText = newAccumulatedText;
        agentData = await callAuraAgent(false);
        console.log('🤖 Agent re-response:', JSON.stringify(agentData, null, 2));
      }
    }


    // ========================================================================
    // UPDATE CONVERSATION TRACKING
    // ========================================================================
    const now = new Date().toISOString();
    const conversationStatus = agentData.conversation_status || 'neutral';
    const isSessionActive = agentData.session_active === true;
    // Follow-ups automáticos de conversa comum foram desativados — soavam forçados.
    // Mantemos APENAS quando há sessão formal ativa (45 min), pra retomar interrupções.
    const shouldEnableFollowup = isSessionActive;

    // Context is always cleared so conversation-followup regenerates it fresh
    // from the current messages via AI — prevents old topics leaking across sessions.
    await supabase
      .from('conversation_followups')
      .upsert({
        user_id: profile.user_id,
        last_user_message_at: shouldEnableFollowup ? now : null,
        followup_count: shouldEnableFollowup ? 0 : 99,
        conversation_context: null,
      }, { onConflict: 'user_id' });
    console.log(`📍 Conversation tracking updated - status: ${conversationStatus}, sessionActive: ${isSessionActive}, followup: ${shouldEnableFollowup}`);

    // ========================================================================
    // SEND RESPONSE MESSAGES (with interruption check)
    // ========================================================================

    for (let i = 0; i < (agentData.messages || []).length; i++) {
      const msg = agentData.messages[i];

      // Check for interruption before each bubble (except first)
      if (i > 0) {
        const { data: currentState } = await supabase
          .from('aura_response_state')
          .select('last_user_message_id')
          .eq('user_id', profile.user_id)
          .maybeSingle();

        const hasNewMessage = currentState?.last_user_message_id &&
                              currentState.last_user_message_id !== currentMessageId;

        console.log(`🔍 Interruption check [${i}/${agentData.messages.length}]: local=${currentMessageId}, db=${currentState?.last_user_message_id}, match=${!hasNewMessage}`);

        if (hasNewMessage) {
          console.log(`🛑 INTERRUPÇÃO DETECTADA! Parando envio de ${agentData.messages.length - i} bubbles restantes.`);
          wasInterrupted = true;
          interruptedAtIndex = i;
          break;
        }
      }

      // Delay between bubbles
      if (i > 0 && msg.delay) {
        const actualDelay = Math.min(msg.delay, 5000);
        console.log(`⏱️ Waiting ${actualDelay}ms before next message...`);
        await new Promise(resolve => setTimeout(resolve, actualDelay));
      }

      let responseText = (msg.text || msg.content || '').replace(/\|\|\|/g, '').trim();




      // Clean all known internal tags
      responseText = responseText
        .replace(/\[AGUARDANDO_RESPOSTA\]/gi, '')
        .replace(/\[CONVERSA_CONCLUIDA\]/gi, '')
        .replace(/\[MODO_AUDIO\]/gi, '')
        .replace(/\[VALOR_ENTREGUE\]/gi, '')
        .replace(/\[ENCERRAR_SESSAO\]/gi, '')
        .replace(/\[INICIAR_SESSAO\]/gi, '')
        .replace(/\[INSIGHTS\].*?\[\/INSIGHTS\]/gis, '')
        .replace(/\[AGENDAR_TAREFA:.*?\]/gi, '')
        .replace(/\[CANCELAR_TAREFA:\w+\]/gi, '')
        .trim();

      // Safety net: remove remaining [UPPERCASE_TAG] patterns
      responseText = responseText
        .replace(/\[\s*[A-Z_]{3,}(?::[^\]]*)?\s*\]/g, '')
        .replace(/\[\s*\/[A-Z_]{3,}\s*\]/g, '')
        .trim();


      if (!responseText) {
        console.log('⏭️ Skipping empty message');
        continue;
      }

      // Audio messages
      if (msg.isAudio) {
        console.log(`🎙️ Generating audio for: ${responseText.substring(0, 50)}...`);
        const { audioUrl, audioContent } = await generateTTS(responseText, profile.user_id);
        if (audioUrl || audioContent) {
          let audioResult: SendResult;
          if (audioUrl) {
            console.log(`🔗 Sending audio via public URL: ${audioUrl}`);
            audioResult = await sendAudioUrl(cleanPhone, audioUrl);
          } else {
            console.log(`📦 No audioUrl available, attempting base64 fallback (Z-API only)`);
            audioResult = await sendAudio(cleanPhone, audioContent!);
          }
          if (audioResult.success) {
            sentAnyResponse = true;
            try {
              const { data: existingAssistant } = await supabase
                .from('messages').select('id')
                .eq('user_id', profile.user_id).eq('role', 'assistant').eq('content', responseText)
                .gte('created_at', new Date(Date.now() - 30000).toISOString())
                .limit(1).maybeSingle();
              if (!existingAssistant) {
                await supabase.from('messages').insert({ user_id: profile.user_id, role: 'assistant', content: responseText });
              } else {
                console.log('⏭️ DEDUP: Assistant audio message already exists, skipping persist');
              }
            } catch {}
            continue;
          }
          console.log(`⚠️ Audio send failed (provider=${audioResult.provider}, error=${audioResult.error}), falling back to text`);
        }
      }

      // Typing delay
      let typingSeconds: number;
      if (responseText.length < 50) typingSeconds = Math.max(1, Math.ceil(responseText.length / 30));
      else if (responseText.length < 100) typingSeconds = Math.ceil(responseText.length / 40);
      else typingSeconds = Math.min(Math.ceil(responseText.length / 35), 6);

      console.log(`📤 Sending text (${responseText.length} chars, ${typingSeconds}s typing): ${responseText.substring(0, 50)}...`);
      
      const sendResult = await sendMessage(cleanPhone, responseText);
      if (!sendResult.success) {
        console.error(`❌ CRITICAL: Failed to send main response to ${cleanPhone?.substring(0, 4)}***: ${sendResult.error}`);
        await logFailedMessage(supabase, profile.user_id, cleanPhone, responseText, sendResult.error);
        // Still persist to DB so context is not lost, but log the failure
      }
      sentAnyResponse = true;

      // Persist assistant message to DB (with dedup check)
      try {
        const { data: existingAssistant2 } = await supabase
          .from('messages').select('id')
          .eq('user_id', profile.user_id).eq('role', 'assistant').eq('content', responseText)
          .gte('created_at', new Date(Date.now() - 30000).toISOString())
          .limit(1).maybeSingle();
        if (!existingAssistant2) {
          await supabase.from('messages').insert({ user_id: profile.user_id, role: 'assistant', content: responseText });
        } else {
          console.log('⏭️ DEDUP: Assistant text message already exists, skipping persist');
        }
      } catch (persistErr) {
        console.warn('⚠️ Failed to persist assistant message:', persistErr);
      }
    }

    // ========================================================================
    // GUARD: If no response was sent and no interruption, RETRY the agent once
    // ========================================================================
    if (!sentAnyResponse && !wasInterrupted && agentData) {
      console.warn(`⚠️ EMPTY RESPONSE GUARD: Agent returned but 0 messages sent. Retrying once...`);
      try {
        const retryData = await callAuraAgent(true); // minimal context for speed
        if (retryData?.messages?.length) {
          for (const msg of retryData.messages) {
            let retryText = (msg.text || msg.content || '').replace(/\|\|\|/g, '').trim();
            retryText = retryText.replace(/\[\s*[A-Z_]{3,}(?::[^\]]*)?\s*\]/g, '').replace(/\[\s*\/[A-Z_]{3,}\s*\]/g, '').trim();
            if (!retryText) continue;
            
            await sendMessage(cleanPhone, retryText);
            sentAnyResponse = true;
            try {
              const { data: retryDedupCheck } = await supabase
                .from('messages').select('id').eq('user_id', profile.user_id).eq('role', 'assistant')
                .eq('content', retryText).gte('created_at', new Date(Date.now() - 30000).toISOString())
                .limit(1).maybeSingle();
              if (!retryDedupCheck) {
                await supabase.from('messages').insert({ user_id: profile.user_id, role: 'assistant', content: retryText });
              } else {
                console.log('⚠️ Retry dedup: skipped duplicate assistant message');
              }
            } catch {}
            break; // send at least one message
          }
        }
        if (!sentAnyResponse) {
          console.error(`🚨 CRITICAL: Agent returned empty on retry too. User ${profile.user_id} got no response. conversation-followup will handle.`);
        }
      } catch (retryErr) {
        console.error(`🚨 CRITICAL: Empty response retry failed:`, retryErr);
      }
    }

    // ========================================================================
    // FINALIZATION
    // ========================================================================
    if (wasInterrupted && interruptedAtIndex > 0) {
      const pendingMessages = agentData.messages
        .slice(interruptedAtIndex)
        .map((m: any) => m.text || m.content || '')
        .filter((t: string) => t.trim())
        .join('\n\n');

      if (pendingMessages) {
        console.log(`📦 Salvando ${agentData.messages.length - interruptedAtIndex} bubbles pendentes para avaliação posterior`);
        await supabase
          .from('aura_response_state')
          .update({ is_responding: false, pending_content: pendingMessages, pending_context: messageText.substring(0, 200) })
          .eq('user_id', profile.user_id);
      }
    } else {
      await supabase
        .from('aura_response_state')
        .update({ is_responding: false, pending_content: null, pending_context: null })
        .eq('user_id', profile.user_id);
    }

    } finally {
      // Safety net: garante liberação do lock mesmo em caso de erro
      try {
        await supabase
          .from('aura_response_state')
          .update({ is_responding: false })
          .eq('user_id', profile.user_id)
          .eq('is_responding', true);
      } catch (cleanupError) {
        console.error(`⚠️ Erro silencioso ao liberar lock para user ${profile.user_id}:`, cleanupError);
      }
    }

    return new Response(JSON.stringify({
      status: wasInterrupted ? 'interrupted' : 'success',
      messagesCount: wasInterrupted ? interruptedAtIndex : (agentData.messages?.length || 0),
      wasAudioMessage: isAudioMessage,
      wasInterrupted
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Worker processing error:', {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : 'unknown',
      stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
      phone: contingencyPhone,
      hasProfile: !!profile,
      hasSupabase: !!supabase,
    });

    // Release lock in outer catch (covers errors between lock acquisition and inner try)
    if (supabase && profile?.user_id) {
      try {
        await supabase.from('aura_response_state')
          .update({ is_responding: false })
          .eq('user_id', profile.user_id)
          .eq('is_responding', true);
      } catch (lockErr) {
        console.error('⚠️ Failed to release lock in outer catch:', lockErr);
      }
    }

    // NO FALLBACK MESSAGE — conversation-followup CRON will handle naturally
    if (!sentAnyResponse) {
      console.error(`🚨 CRITICAL: User got NO response at all. conversation-followup will detect and re-engage naturally.`);
    } else {
      console.log('ℹ️ Error after response already sent — no action needed');
    }

    return new Response(JSON.stringify({ error: 'processing_failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
