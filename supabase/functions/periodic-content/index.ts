import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para obter horário de Brasília (UTC-3)
function getBrasiliaTimeString(date: Date = new Date()): string {
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🚀 Starting periodic content delivery (Manifesto System)');
    console.log(`🇧🇷 Horário de Brasília: ${getBrasiliaTimeString()}`);

    // Buscar usuários elegíveis
    // - status ativo ou trial
    // - tem current_journey_id definido
    // - não recebeu conteúdo nos últimos 2.5 dias (margem de segurança para terça/sexta)
    // Nota: De terça 09:00 BR até sexta 09:00 BR = 3 dias exatos
    // Usando 2.5 dias (60h) garante que pequenas variações de horário não afetem elegibilidade
    const eligibilityThreshold = new Date();
    eligibilityThreshold.setTime(eligibilityThreshold.getTime() - (2.5 * 24 * 60 * 60 * 1000));

    console.log(`📅 Threshold de elegibilidade: ${eligibilityThreshold.toISOString()} (${getBrasiliaTimeString(eligibilityThreshold)} BR)`);

    const { data: eligibleUsers, error: usersError } = await supabase
      .from('profiles')
      .select('*')
      .in('status', ['active', 'trial'])
      .not('current_journey_id', 'is', null)
      .not('phone', 'is', null)
      .or(`last_content_sent_at.is.null,last_content_sent_at.lte.${eligibilityThreshold.toISOString()}`);

    if (usersError) {
      console.error('❌ Error fetching eligible users:', usersError);
      throw usersError;
    }

    console.log(`📋 Found ${eligibleUsers?.length || 0} eligible users`);

    if (!eligibleUsers || eligibleUsers.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No eligible users found',
        processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let successCount = 0;
    let errorCount = 0;

    for (const user of eligibleUsers) {
      try {
        console.log(`\n👤 Processing user: ${user.name || 'Unknown'} (episode ${user.current_episode || 0}, last_content: ${user.last_content_sent_at ? getBrasiliaTimeString(new Date(user.last_content_sent_at)) : 'never'} BR)`);

        // Buscar o episódio atual da jornada
        const currentEpisode = (user.current_episode || 0) + 1; // Próximo episódio

        const { data: episode, error: episodeError } = await supabase
          .from('journey_episodes')
          .select('*, content_journeys(*)')
          .eq('journey_id', user.current_journey_id)
          .eq('episode_number', currentEpisode)
          .single();

        if (episodeError || !episode) {
          console.log(`⚠️ Episode ${currentEpisode} not found for journey ${user.current_journey_id}`);
          
          // Verificar se terminou a jornada
          const { data: journey } = await supabase
            .from('content_journeys')
            .select('*')
            .eq('id', user.current_journey_id)
            .single();

          if (journey && currentEpisode > journey.total_episodes) {
            // Jornada completa! Enviar mensagem de conclusão com opções
            console.log(`🎉 Journey completed! Sending choice message`);
            
            // Buscar todas as jornadas para mostrar opções
            const { data: allJourneys } = await supabase
              .from('content_journeys')
              .select('id, title, description')
              .eq('is_active', true)
              .neq('id', user.current_journey_id)
              .order('id');
            
            const userName = user.name?.split(' ')[0] || 'você';
            
            let journeyOptions = '';
            if (allJourneys && allJourneys.length > 0) {
              journeyOptions = allJourneys.map((j, idx) => 
                `${idx + 1}. *${j.title}*`
              ).join('\n');
            }
            
            const completionMessage = `🎉 ${userName}, você completou a jornada *${journey.title}*!

Foram ${journey.total_episodes} episódios. Cada manifesto que você leu em voz alta plantou uma semente. 💜

Agora você pode escolher sua próxima jornada:

${journeyOptions}

Ou posso continuar com a próxima automaticamente.

_Se preferir pausar, é só dizer "pausar jornadas" 🌿_

Qual vai ser?`;

            // Enviar mensagem de conclusão
            const cleanPhone = cleanPhoneNumber(user.phone);
            await sendTextMessage(cleanPhone, completionMessage);
            
            // Atualizar para próxima jornada por padrão
            await supabase
              .from('profiles')
              .update({
                current_journey_id: journey.next_journey_id,
                current_episode: 0,
                journeys_completed: (user.journeys_completed || 0) + 1,
                last_content_sent_at: new Date().toISOString()
              })
              .eq('id', user.id);
            
            // Salvar mensagem no histórico
            await supabase
              .from('messages')
              .insert({
                user_id: user.user_id,
                role: 'assistant',
                content: completionMessage
              });
            
            successCount++;
          }
          continue;
        }

        // Chamar a função de geração de manifesto
        console.log(`📝 Calling generate-episode-manifesto for episode ${currentEpisode}`);

        const { data: manifestoResult, error: manifestoError } = await supabase.functions.invoke(
          'generate-episode-manifesto',
          {
            body: {
              user_id: user.user_id,
              episode_id: episode.id
            }
          }
        );

        if (manifestoError || !manifestoResult?.success) {
          console.error(`❌ Manifesto generation failed:`, manifestoError || manifestoResult?.error);
          errorCount++;
          continue;
        }

        const message = manifestoResult.message;

        // Enviar via Z-API
        const cleanPhone = cleanPhoneNumber(user.phone);
        const sendResult = await sendTextMessage(cleanPhone, message);

        if (sendResult.success) {
          console.log(`✅ Manifesto sent to ${user.name?.split(' ')[0] || 'user'}`);
          
          // Atualizar profile
          await supabase
            .from('profiles')
            .update({
              current_episode: currentEpisode,
              last_content_sent_at: new Date().toISOString()
            })
            .eq('id', user.id);

          // Salvar mensagem no histórico
          await supabase
            .from('messages')
            .insert({
              user_id: user.user_id,
              role: 'assistant',
              content: message
            });

          successCount++;
        } else {
          console.error(`❌ Failed to send to ${user.name}:`, sendResult.error);
          errorCount++;
        }

      } catch (userError) {
        console.error(`❌ Error processing user ${user.id}:`, userError);
        errorCount++;
      }
    }

    console.log(`\n📊 Summary: ${successCount} sent, ${errorCount} errors`);

    return new Response(JSON.stringify({ 
      success: true,
      processed: eligibleUsers.length,
      sent: successCount,
      errors: errorCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Periodic content error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
