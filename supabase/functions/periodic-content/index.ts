import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { routeNotification } from "../_shared/notification-router.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: users, error } = await supabase.from("profiles")
      .select("user_id,name,phone,current_journey_id,current_episode")
      .in("status", ["active", "trial"])
      .not("current_journey_id", "is", null)
      .eq("journey_paused", false);
    if (error) throw error;

    let released = 0;
    let waiting = 0;
    let errors = 0;
    for (const user of users || []) {
      try {
        const { data: result, error: releaseError } = await supabase.rpc("release_next_journey_episode", { _user_id: user.user_id });
        if (releaseError) throw releaseError;
        if (!result?.released) {
          waiting++;
          continue;
        }
        const { data: episode, error: episodeError } = await supabase.from("journey_episodes")
          .select("id,title,stage_title,episode_number,reading_minutes,content_journeys(title,total_episodes)")
          .eq("id", result.episode_id).single();
        if (episodeError || !episode) throw episodeError || new Error("episode_not_found");

        const journeyData = Array.isArray(episode.content_journeys) ? episode.content_journeys[0] : episode.content_journeys;
        const journeyTitle = journeyData?.title || "Sua jornada";
        const totalEpisodes = journeyData?.total_episodes || episode.episode_number;
        const episodeTitle = episode.stage_title || episode.title;
        const episodePath = `/episodio/${episode.id}?u=${encodeURIComponent(user.user_id)}`;
        const message = `Um novo episódio de “${journeyTitle}” está disponível para você.`;

        await supabase.from("messages").upsert({
          user_id: user.user_id,
          role: "assistant",
          content: message,
          client_message_id: `journey:${episode.id}:${user.user_id}`,
          delivery_status: "delivered",
          metadata: { kind: "journey_episode_card", episode_id: episode.id, path: episodePath, journey_title: journeyTitle,
            episode_number: episode.episode_number, total_episodes: totalEpisodes, title: episodeTitle,
            reading_minutes: episode.reading_minutes || 1, cta: "Abrir episódio" },
        }, { onConflict: "client_message_id" });

        const phone = user.phone ? cleanPhoneNumber(user.phone) : undefined;
        await routeNotification(supabase, {
          userId: user.user_id,
          phone,
          idempotencyKey: `journey:${episode.id}:${user.user_id}`,
          category: "journey",
          type: "journey_available",
          path: episodePath,
          whatsappText: `${message}\n\nhttps://olaaura.com.br${episodePath}`,
          whatsappCategory: "content",
          teaserText: message,
        });
        await supabase.from("portal_value_events").insert({ user_id: user.user_id, feature: "journey", event_type: "journey_episode_released", metadata: { episode_id: episode.id } });
        released++;
      } catch (userError) {
        console.error("Falha ao liberar episódio:", user.user_id, userError);
        errors++;
      }
    }
    return new Response(JSON.stringify({ success: true, processed: users?.length || 0, released, waiting, errors }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Falha na liberação periódica:", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "unknown_error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});