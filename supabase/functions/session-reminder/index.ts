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

    console.log(`🕐 Session reminder running at ${now.toISOString()}`);

    // Buscar sessões agendadas para lembrete de 1 hora
    const { data: sessions1h, error: error1h } = await supabase
      .from('sessions')
      .select(`
        id,
        user_id,
        scheduled_at,
        session_type,
        focus_topic
      `)
      .eq('status', 'scheduled')
      .eq('reminder_1h_sent', false)
      .lte('scheduled_at', oneHourFromNow.toISOString())
      .gt('scheduled_at', now.toISOString());

    if (error1h) {
      console.error('❌ Error fetching 1h sessions:', error1h);
    }

    // Buscar sessões para lembrete de 15 minutos
    const { data: sessions15m, error: error15m } = await supabase
      .from('sessions')
      .select(`
        id,
        user_id,
        scheduled_at,
        session_type,
        focus_topic
      `)
      .eq('status', 'scheduled')
      .eq('reminder_15m_sent', false)
      .lte('scheduled_at', fifteenMinutesFromNow.toISOString())
      .gt('scheduled_at', now.toISOString());

    if (error15m) {
      console.error('❌ Error fetching 15m sessions:', error15m);
    }

    let reminders1hSent = 0;
    let reminders15mSent = 0;

    // Processar lembretes de 1 hora
    if (sessions1h && sessions1h.length > 0) {
      for (const session of sessions1h) {
        // Buscar perfil do usuário
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
          minute: '2-digit'
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

    // Processar lembretes de 15 minutos
    if (sessions15m && sessions15m.length > 0) {
      for (const session of sessions15m) {
        // Pular se já enviamos o lembrete de 1h nesta mesma execução
        if (sessions1h?.some(s => s.id === session.id)) {
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

    console.log(`📊 Session reminders completed: ${reminders1hSent} 1h reminders, ${reminders15mSent} 15m reminders`);

    return new Response(JSON.stringify({ 
      success: true,
      reminders_1h_sent: reminders1hSent,
      reminders_15m_sent: reminders15mSent,
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
