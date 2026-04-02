import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMessage, sendAudioUrl, sendProactive } from "../_shared/whatsapp-provider.ts";
import { getInstanceConfigForUser } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getBrtHour(): number {
  return (new Date().getUTCHours() - 3 + 24) % 24;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Quiet hours guard: no deliveries between 22h and 8h BRT
    const brtHour = getBrtHour();
    if (brtHour < 8 || brtHour >= 22) {
      console.log(`🌙 Quiet hours (${brtHour}h BRT) - skipping time capsule delivery (will retry next run)`);
      return new Response(JSON.stringify({ status: 'skipped', reason: 'quiet_hours', brt_hour: brtHour }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('📦 [deliver-time-capsule] Checking for capsules to deliver...');

    // Buscar cápsulas que devem ser entregues
    const { data: capsules, error } = await supabase
      .from('time_capsules')
      .select('*, profiles!inner(phone, name, user_id, status, whatsapp_instance_id)')
      .eq('delivered', false)
      .lte('deliver_at', new Date().toISOString())
      .limit(20);

    if (error) {
      console.error('❌ Error fetching capsules:', error);
      throw error;
    }

    if (!capsules || capsules.length === 0) {
      console.log('✅ No capsules to deliver');
      return new Response(JSON.stringify({ delivered: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📬 Found ${capsules.length} capsules to deliver`);
    let delivered = 0;

    for (const capsule of capsules) {
      const profile = capsule.profiles;
      if (!profile?.phone || profile.status === 'inactive') {
        console.log(`⏭️ Skipping capsule ${capsule.id} - no phone or inactive user`);
        continue;
      }

      try {
        const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
        const userName = profile.name || 'você';

        // Mensagem introdutória
        const introMsg = `${userName}, lembra daquela cápsula do tempo que você gravou? 💜✨\n\nChegou a hora! Aqui está a mensagem que o seu eu do passado deixou pra você. Escuta com carinho 🫶`;
        
        await sendMessage(profile.phone, introMsg);

        // Pequeno delay antes de enviar o áudio
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Enviar áudio original
        const audioResult = await sendAudioUrl(profile.phone, capsule.audio_url);
        
        if (!audioResult.success) {
          console.error(`❌ Failed to send capsule audio for ${capsule.id}:`, audioResult.error);
          // Enviar transcrição como fallback
          if (capsule.transcription) {
            const fallbackMsg = `Não consegui enviar o áudio original, mas aqui está o que você disse:\n\n"${capsule.transcription}" 💜`;
            await sendMessage(profile.phone, fallbackMsg);
          }
        }

        // Mensagem de encerramento
        await new Promise(resolve => setTimeout(resolve, 2000));
        const closingMsg = `E aí, como é ouvir isso agora? 💜 Mudou muita coisa desde então?`;
        await sendMessage(profile.phone, closingMsg);

        // Marcar como entregue
        await supabase.from('time_capsules').update({
          delivered: true,
          delivered_at: new Date().toISOString(),
        }).eq('id', capsule.id);

        // Salvar no histórico de mensagens
        await supabase.from('messages').insert([
          { user_id: profile.user_id, role: 'assistant', content: introMsg },
          { user_id: profile.user_id, role: 'assistant', content: '[Áudio da cápsula do tempo reenviado]' },
          { user_id: profile.user_id, role: 'assistant', content: closingMsg },
        ]);

        delivered++;
        console.log(`✅ Capsule ${capsule.id} delivered to ${profile.phone.substring(0, 4)}***`);

      } catch (err) {
        console.error(`❌ Error delivering capsule ${capsule.id}:`, err);
      }
    }

    console.log(`📦 Delivery complete: ${delivered}/${capsules.length} capsules delivered`);

    return new Response(JSON.stringify({ delivered, total: capsules.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ deliver-time-capsule error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
