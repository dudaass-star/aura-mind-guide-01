import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🚀 Starting periodic content delivery');

    // Buscar usuários elegíveis
    // - status ativo ou trial
    // - tem current_journey_id definido
    // - não recebeu conteúdo nos últimos 3 dias (para 2x/semana)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data: eligibleUsers, error: usersError } = await supabase
      .from('profiles')
      .select('*')
      .in('status', ['active', 'trial'])
      .not('current_journey_id', 'is', null)
      .not('phone', 'is', null)
      .or(`last_content_sent_at.is.null,last_content_sent_at.lt.${threeDaysAgo.toISOString()}`);

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
        console.log(`\n👤 Processing user: ${user.name || 'Unknown'} (episode ${user.current_episode || 0})`);

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
            // Jornada completa! Iniciar próxima
            console.log(`🎉 Journey completed! Moving to next: ${journey.next_journey_id}`);
            
            await supabase
              .from('profiles')
              .update({
                current_journey_id: journey.next_journey_id,
                current_episode: 0,
                journeys_completed: (user.journeys_completed || 0) + 1
              })
              .eq('id', user.id);
          }
          continue;
        }

        const journeyTitle = episode.content_journeys?.title || 'Jornada';
        const totalEpisodes = episode.content_journeys?.total_episodes || 8;
        const userName = user.name?.split(' ')[0] || 'você';

        // Buscar contexto do usuário para personalização
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('content, role')
          .eq('user_id', user.user_id)
          .order('created_at', { ascending: false })
          .limit(10);

        const userContext = recentMessages
          ? recentMessages
              .filter(m => m.role === 'user')
              .map(m => m.content)
              .join(' | ')
              .substring(0, 500)
          : '';

        // Gerar conteúdo personalizado via IA
        const contentPrompt = episode.content_prompt.replace('{user_context}', userContext);
        
        console.log(`📝 Generating content for episode ${currentEpisode}: ${episode.title}`);

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { 
                role: "system", 
                content: `Você é a AURA, uma amiga que entende muito de psicologia. 
Seu tom é caloroso, direto e acolhedor. Use linguagem brasileira natural ("pra", "tá", "né").
Use emojis com moderação (1-2 por parágrafo).
Formate para WhatsApp: use *negrito* para destaques.
Fale diretamente com ${userName}.
Seja breve mas profunda - máximo 4 parágrafos curtos.`
              },
              { 
                role: "user", 
                content: `Gere o conteúdo para este episódio:

Título: ${episode.title}
Instruções: ${contentPrompt}

Contexto adicional do usuário (use se relevante): ${userContext || 'Não há contexto adicional'}`
              }
            ],
            max_tokens: 600,
          }),
        });

        if (!aiResponse.ok) {
          console.error(`❌ AI error for user ${user.id}:`, await aiResponse.text());
          errorCount++;
          continue;
        }

        const aiData = await aiResponse.json();
        const generatedContent = aiData.choices?.[0]?.message?.content?.trim();

        if (!generatedContent) {
          console.error(`❌ No content generated for user ${user.id}`);
          errorCount++;
          continue;
        }

        // Montar mensagem final com header e hook
        const message = `Bom dia, ${userName}! 🌅

📺 *Episódio ${currentEpisode} de ${totalEpisodes}: ${episode.title}*
_Jornada: ${journeyTitle}_

${generatedContent}

---

${episode.hook_text}

💜 Estou aqui se quiser conversar!`;

        // Enviar via Z-API
        const cleanPhone = cleanPhoneNumber(user.phone);
        const sendResult = await sendTextMessage(cleanPhone, message);

        if (sendResult.success) {
          console.log(`✅ Content sent to ${userName}`);
          
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
          console.error(`❌ Failed to send to ${userName}:`, sendResult.error);
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
