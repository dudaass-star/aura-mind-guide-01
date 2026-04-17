import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendProactive, sendForcedTemplate } from "../_shared/whatsapp-provider.ts";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEMPLATE_TEST_DEDUPE_WINDOW_MS = 90 * 1000;

function getTemplateTestLockKey(userId: string, episodeId: string): string {
  return `test_episode_send:${userId}:${episodeId}:template`;
}

function getLockSentAt(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'sent_at' in value) {
    const sentAt = (value as { sent_at?: unknown }).sent_at;
    return typeof sentAt === 'string' ? sentAt : null;
  }
  return null;
}

function wasSentRecently(sentAt: string | null): boolean {
  if (!sentAt) return false;
  const sentMs = new Date(sentAt).getTime();
  if (Number.isNaN(sentMs)) return false;
  return Date.now() - sentMs < TEMPLATE_TEST_DEDUPE_WINDOW_MS;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, episode_id, phone, force_template = false } = await req.json();

    if (!user_id || !episode_id || !phone) {
      throw new Error('user_id, episode_id and phone are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`🧪 Test: Generating episode for user ${user_id} (force_template=${force_template})`);

    if (force_template) {
      const lockKey = getTemplateTestLockKey(user_id, episode_id);
      const { data: existingLock, error: lockError } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', lockKey)
        .maybeSingle();

      if (lockError) {
        console.warn(`⚠️ [Force Template] Could not read dedupe lock ${lockKey}:`, lockError);
      }

      const lastSentAt = getLockSentAt(existingLock?.value);
      if (wasSentRecently(lastSentAt)) {
        const secondsAgo = Math.round((Date.now() - new Date(lastSentAt!).getTime()) / 1000);
        console.warn(`⛔ [Force Template] Duplicate blocked for ${lockKey}. Last send ${secondsAgo}s ago.`);

        return new Response(JSON.stringify({
          success: false,
          mode: 'force_template',
          duplicate_blocked: true,
          retry_after_seconds: Math.max(1, Math.ceil((TEMPLATE_TEST_DEDUPE_WINDOW_MS - (Date.now() - new Date(lastSentAt!).getTime())) / 1000)),
          error: `Template de teste já foi enviado há ${secondsAgo}s. Bloqueado para evitar duplicidade.`,
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Invoke generate-episode-manifesto with teaser enabled
    const { data: manifestoData, error: manifestoError } = await supabase.functions.invoke('generate-episode-manifesto', {
      body: { user_id, episode_id, generate_teaser: true }
    });

    if (manifestoError || !manifestoData?.success) {
      throw new Error(`Manifesto generation failed: ${manifestoError?.message || manifestoData?.error}`);
    }

    console.log(`✅ Episode generated (teaser: ${manifestoData.teaser ? 'yes' : 'no'})`);

    // Save TEASER (com link curto) como pending_insight.
    // Quando o usuário clicar em "Acessar" no template, recebe apenas o teaser+link
    // — o conteúdo completo da jornada vive no /episodio/{id}.
    const pendingPayload = manifestoData.teaser && String(manifestoData.teaser).trim().length > 0
      ? manifestoData.teaser
      : manifestoData.message;
    try {
      await supabase.from('profiles').update({
        pending_insight: `[CONTENT]${pendingPayload}`,
      }).eq('user_id', user_id);
    } catch (e) {
      console.warn('⚠️ Could not save pending_insight [CONTENT]:', e);
    }

    const cleanPhone = cleanPhoneNumber(phone);

    // ─────────────────────────────────────────────────────────────────────
    // FORCE_TEMPLATE: caminho determinístico — envia o template oficial
    // jornada_disponivel diretamente, sem depender de janela de 24h nem
    // do provider ativo. Falha fechado se não sair como template.
    // ─────────────────────────────────────────────────────────────────────
    if (force_template) {
      console.log(`🎯 [Force Template] Sending jornada_disponivel via deterministic path`);

      const sendResult = await sendForcedTemplate(
        cleanPhone,
        'content',
        user_id,
      );

      if (!sendResult.success || sendResult.type !== 'template') {
        const reason = sendResult.error || `Unexpected send type: ${sendResult.type}`;
        console.error(`❌ [Force Template] Failed: ${reason}`);
        return new Response(JSON.stringify({
          success: false,
          mode: 'force_template',
          provider: sendResult.provider,
          send_type: sendResult.type,
          error: reason,
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const lockKey = getTemplateTestLockKey(user_id, episode_id);
      const { error: lockWriteError } = await supabase
        .from('system_config')
        .upsert({
          key: lockKey,
          value: {
            sent_at: new Date().toISOString(),
            phone: cleanPhone,
            mode: 'force_template',
          },
        }, { onConflict: 'key' });

      if (lockWriteError) {
        console.warn(`⚠️ [Force Template] Could not persist dedupe lock ${lockKey}:`, lockWriteError);
      }

      console.log(`✅ [Force Template] Template sent via ${sendResult.provider}`);
      return new Response(JSON.stringify({
        success: true,
        mode: 'force_template',
        provider: sendResult.provider,
        send_type: sendResult.type,
        template_category: 'content',
        episode: manifestoData.stage_title,
        episode_number: manifestoData.episode_number,
        had_teaser: !!manifestoData.teaser,
        note: 'Template enviado. O conteúdo rico está em pending_insight e será entregue quando o usuário clicar no botão "Acessar".',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // Caminho normal: roteamento automático (janela 24h + provider ativo)
    // ─────────────────────────────────────────────────────────────────────
    const sendResult = await sendProactive(
      cleanPhone,
      manifestoData.message,
      'content',
      user_id,
      undefined,
      manifestoData.teaser || undefined
    );

    console.log(`✅ Message sent via ${sendResult.provider}`);

    return new Response(JSON.stringify({
      success: true,
      mode: 'auto',
      provider: sendResult.provider,
      episode: manifestoData.stage_title,
      episode_number: manifestoData.episode_number,
      had_teaser: !!manifestoData.teaser,
      send_result: sendResult
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Test error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
