import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, episode_id, generate_teaser } = await req.json();

    if (!user_id || !episode_id) {
      throw new Error('user_id and episode_id are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`🎯 Generating episode content for user ${user_id}, episode ${episode_id}`);

    // Buscar dados do usuário
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (profileError || !profile) {
      throw new Error(`Profile not found: ${profileError?.message}`);
    }

    const userName = profile.name?.split(' ')[0] || 'você';

    // Buscar dados do episódio
    const { data: episode, error: episodeError } = await supabase
      .from('journey_episodes')
      .select('*, content_journeys(*)')
      .eq('id', episode_id)
      .single();

    if (episodeError || !episode) {
      throw new Error(`Episode not found: ${episodeError?.message}`);
    }

    const journeyTitle = episode.content_journeys?.title || 'Jornada';
    const totalEpisodes = episode.content_journeys?.total_episodes || 8;
    const stageTitle = episode.stage_title || episode.title;
    const isLastEpisode = episode.episode_number === totalEpisodes;

    // Montar mensagem completa do episódio
    const essayContent = episode.essay_content || episode.content_prompt || '';
    const hookToNext = episode.hook_to_next || '';

    let message: string;

    if (isLastEpisode) {
      message = `Oi ${userName}. 💜

📍 *EP ${episode.episode_number}/${totalEpisodes} — ${stageTitle}*
_${journeyTitle}_

---

${essayContent}

---

✨ *${journeyTitle} — Concluída*

Você caminhou ${totalEpisodes} episódios.
Isso não é pouco. Isso é raro.

---

💜 *Sua próxima jornada*
${hookToNext}

Te espero. 💜`;
    } else {
      const optOutNotice = episode.episode_number === 1 
        ? "\n\n_Se preferir pausar os episódios, é só me dizer \"pausar jornadas\" 🌿_"
        : "";

      message = `Oi ${userName}. 💜

📍 *EP ${episode.episode_number}/${totalEpisodes} — ${stageTitle}*
_${journeyTitle}_

---

${essayContent}

---

⏭️ *No próximo episódio...*
${hookToNext}

Te espero. 💜${optOutNotice}`;
    }

    // Generate teaser + short link if requested (for outside 24h window)
    let teaser: string | null = null;
    let shortUrl: string | null = null;

    if (generate_teaser) {
      console.log('📎 Generating teaser + short link for episode');

      // Buscar (ou criar) o token do portal do usuário para que o link
      // do episódio já abra com contexto e o botão "Meu Espaço" funcione.
      let portalToken: string | null = null;
      try {
        const { data: existingToken } = await supabase
          .from('user_portal_tokens')
          .select('token')
          .eq('user_id', user_id)
          .maybeSingle();

        if (existingToken?.token) {
          portalToken = existingToken.token as string;
        } else {
          const { data: newToken, error: insertError } = await supabase
            .from('user_portal_tokens')
            .insert({ user_id })
            .select('token')
            .single();
          if (insertError) {
            console.warn('⚠️ Falha ao criar portal token:', insertError.message);
          } else {
            portalToken = newToken?.token as string;
          }
        }
      } catch (tokenErr) {
        console.warn('⚠️ Erro inesperado ao resolver portal token:', tokenErr);
      }

      // Build the page URL using the custom domain
      const siteUrl = 'https://olaaura.com.br';
      const params = new URLSearchParams();
      // Mantém `u` por compatibilidade (final de jornada precisa do user_id)
      // ou para qualquer link que envolva escolha da próxima jornada.
      if (isLastEpisode && user_id) {
        params.set('u', user_id);
      } else if (user_id) {
        params.set('u', user_id);
      }
      if (portalToken) {
        params.set('t', portalToken);
      }
      const query = params.toString();
      const episodePageUrl = `${siteUrl}/episodio/${episode_id}${query ? `?${query}` : ''}`;
      shortUrl = episodePageUrl;

      teaser = `Oi ${userName}. 💜

📍 *EP ${episode.episode_number}/${totalEpisodes} — ${stageTitle}*
_${journeyTitle}_

Seu episódio está pronto. Toque para ler:
👉 ${shortUrl}

— Aura`;
    }

    console.log('✅ Episode message built successfully');

    return new Response(JSON.stringify({ 
      success: true,
      message,
      teaser,
      shortUrl,
      episode_number: episode.episode_number,
      stage_title: stageTitle,
      is_last_episode: isLastEpisode
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Generate episode error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
