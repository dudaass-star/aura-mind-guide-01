import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.117.3/cors';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return reply({});
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply({ error: 'Configuração ausente' }, 500);
  const db = createClient(url, key);
  const { data: secret, error: secretError } = await db.rpc('get_admin_metrics_snapshot_secret');
  if (secretError || !secret || req.headers.get('x-internal-secret') !== secret) return reply({ error: 'Acesso restrito' }, 403);
  if (req.method !== 'POST') return reply({ error: 'Método inválido' }, 405);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) return reply({ error: 'Corpo inválido' }, 400);
  try {
    const { data: rows, error } = await db.rpc('claim_chat_response_recovery');
    if (error) throw error;
    await Promise.all((rows || []).map(async (row: any) => {
      const finish = async (status: string, lastError: string | null = null) => {
        const { error } = await db.from('chat_response_recovery').update({ status, last_error: lastError, lease_until: null, next_attempt_at: new Date(Date.now() + row.attempts * 60_000).toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'running').eq('attempts', row.attempts);
        if (error) throw error;
      };
      try {
        const { data: latest, error: latestError } = await db.from('messages').select('id,client_message_id,content,is_audio,audio_url,metadata,created_at').eq('user_id', row.user_id).eq('role', 'user').eq('channel', 'in_app').order('sequence_no', { ascending: false }).limit(1).maybeSingle();
        if (latestError) throw latestError;
        // Nunca reproduzir mensagens antigas depois de a pessoa mudar o assunto.
        if (!latest || latest.client_message_id !== row.client_message_id) return await finish('superseded');
        const { data: answers, error: answersError } = await db.from('messages').select('metadata').eq('user_id', row.user_id).eq('role', 'assistant').contains('metadata', { reply_to_message_id: latest.id }).limit(20);
        if (answersError) throw answersError;
        if (answers?.some((r: any) => r.metadata?.kind !== 'response_failure')) return await finish('resolved');
        const { data: state, error: stateError } = await db.from('aura_response_state').select('is_responding,response_started_at').eq('user_id', row.user_id).maybeSingle();
        if (stateError) throw stateError;
        if (state?.is_responding && Date.now() - Date.parse(state.response_started_at) < 120_000) return await finish('pending');
        const { data: entitled, error: entitlementError } = await db.rpc('has_portal_entitlement', { _user_id: row.user_id });
        if (entitlementError) throw entitlementError;
        if (!entitled) return await finish('exhausted', 'Acesso não disponível');
        let audioUrl = latest.audio_url;
        const path = latest.metadata?.audio_storage_path;
        if (latest.is_audio && typeof path === 'string') {
          const { data: signed, error } = await db.storage.from('chat-audios').createSignedUrl(path, 900);
          if (error || !signed?.signedUrl) throw error || new Error('Áudio indisponível');
          audioUrl = signed.signedUrl;
        }
        const response = await fetch(`${url}/functions/v1/process-webhook-message`, {
          method: 'POST', signal: AbortSignal.timeout(60_000),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'x-internal-secret': Deno.env.get('INTERNAL_WEBHOOK_SECRET') || '' },
          body: JSON.stringify({ channel: 'in_app', userId: row.user_id, messageId: row.client_message_id, inboundMessageDbId: latest.id, text: latest.is_audio ? '' : latest.content, hasAudio: latest.is_audio, audioUrl, hasImage: false, automaticRecoveryAttempt: 2 }),
        });
        if (!response.ok) throw new Error(`Processamento indisponível: ${response.status}`);
        // O gatilho das métricas resolve a fila; resposta HTTP sozinha não comprova entrega.
        const { data: after, error: afterError } = await db.from('messages').select('metadata').eq('user_id', row.user_id).eq('role', 'assistant').contains('metadata', { reply_to_message_id: latest.id }).limit(20);
        if (afterError) throw afterError;
        await finish(after?.some((r: any) => r.metadata?.kind !== 'response_failure') ? 'resolved' : 'pending');
      } catch (error) {
        console.warn('Recuperação limitada do turno falhou', row.id, error instanceof Error ? error.message : 'Erro interno');
        await finish(row.attempts >= 3 ? 'exhausted' : 'pending', error instanceof Error ? error.message.slice(0, 200) : 'Erro interno');
      }
    }));
    return reply({ version: 'durable-v1', checked: rows?.length || 0 });
  } catch { return reply({ error: 'Recuperação não concluída' }, 500); }
});