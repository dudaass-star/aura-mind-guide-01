import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FOLLOWUP_MESSAGES = [
  // Primeiro follow-up (após 15 min)
  [
    "Ei, ainda tá aí? 💜",
    "Oi, você sumiu... tá tudo bem?",
    "Ei, ainda por aqui? Me conta...",
  ],
  // Segundo follow-up (após mais 15 min)
  [
    "Olha, se precisar conversar, tô aqui. Sem pressa. 💜",
    "Só passando pra dizer que continuo por aqui quando você quiser.",
    "Tudo bem se precisar de um tempo. Quando quiser voltar, estarei aqui.",
  ],
];

async function generateContextualFollowup(
  supabase: any,
  userId: string,
  followupCount: number,
  lastContext: string | null
): Promise<string> {
  // Get last few messages for context
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('content, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  // If we have context, use AI to generate contextual message
  if (recentMessages && recentMessages.length > 0) {
    const lastUserMessage = recentMessages.find((m: any) => m.role === 'user');
    const lastAssistantMessage = recentMessages.find((m: any) => m.role === 'assistant');

    if (lastUserMessage || lastAssistantMessage) {
      try {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        
        if (LOVABLE_API_KEY) {
          const context = lastUserMessage?.content || lastAssistantMessage?.content;
          const isFirst = followupCount === 0;
          
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
                  content: `Você é a AURA, uma mentora emocional gentil. 
O usuário parou de responder há ${isFirst ? '15' : '30'} minutos.
Gere UMA mensagem curta (máximo 2 frases) para retomar contato.
${isFirst ? 'Seja gentil e curiosa.' : 'Seja compreensiva e deixe espaço.'}
Use linguagem informal brasileira. 
NÃO use emojis demais (máximo 1).
Faça referência sutil ao contexto da conversa.`
                },
                {
                  role: 'user',
                  content: `Contexto da última conversa: "${context?.substring(0, 200)}"\n\nGere a mensagem de follow-up:`
                }
              ],
              max_tokens: 100,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const aiMessage = data.choices?.[0]?.message?.content?.trim();
            if (aiMessage) {
              console.log('✨ Generated contextual follow-up:', aiMessage);
              return aiMessage;
            }
          }
        }
      } catch (error) {
        console.error('⚠️ Error generating contextual message:', error);
      }
    }
  }

  // Fallback to predefined messages
  const messageSet = FOLLOWUP_MESSAGES[Math.min(followupCount, FOLLOWUP_MESSAGES.length - 1)];
  return messageSet[Math.floor(Math.random() * messageSet.length)];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔄 Starting conversation follow-up check...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID')!;
    const zapiToken = Deno.env.get('ZAPI_TOKEN')!;
    const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN')!;

    // Time threshold: 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const MAX_FOLLOWUPS = 2;

    // Find conversations needing follow-up:
    // - Last user message was more than 15 minutes ago
    // - Less than 2 follow-ups sent
    // - Either no follow-up sent yet, or last follow-up was more than 15 minutes ago
    // - IMPORTANT: last_user_message_at must NOT be null (null = conversation concluded, no follow-up needed)
    const { data: followups, error: fetchError } = await supabase
      .from('conversation_followups')
      .select(`
        *,
        profiles!fk_user (
          name,
          phone,
          status
        )
      `)
      .not('last_user_message_at', 'is', null)  // Only if follow-up is enabled
      .lt('last_user_message_at', fifteenMinutesAgo)
      .lt('followup_count', MAX_FOLLOWUPS)
      .or(`last_followup_at.is.null,last_followup_at.lt.${fifteenMinutesAgo}`);

    if (fetchError) {
      throw new Error(`Error fetching followups: ${fetchError.message}`);
    }

    console.log(`📋 Found ${followups?.length || 0} conversations needing follow-up (with pending questions)`);

    let sentCount = 0;

    for (const followup of followups || []) {
      try {
        const profile = followup.profiles;
        
        // Skip if no phone or user is not active
        if (!profile?.phone || profile?.status !== 'active') {
          console.log(`⏭️ Skipping user ${followup.user_id}: no phone or inactive`);
          continue;
        }

        // Generate contextual message
        const message = await generateContextualFollowup(
          supabase,
          followup.user_id,
          followup.followup_count,
          followup.conversation_context
        );

        console.log(`📤 Sending follow-up #${followup.followup_count + 1} to ${profile.phone}`);

        // Send via Z-API
        const sendResponse = await fetch(
          `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-text`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Client-Token': zapiClientToken,
            },
            body: JSON.stringify({
              phone: profile.phone,
              message: message,
            }),
          }
        );

        if (sendResponse.ok) {
          console.log(`✅ Follow-up sent successfully`);
          sentCount++;

          // Update follow-up record
          await supabase
            .from('conversation_followups')
            .update({
              followup_count: followup.followup_count + 1,
              last_followup_at: new Date().toISOString(),
            })
            .eq('id', followup.id);

          // Save message to history
          await supabase.from('messages').insert({
            user_id: followup.user_id,
            role: 'assistant',
            content: message,
          });
        } else {
          const error = await sendResponse.text();
          console.error(`❌ Failed to send follow-up: ${error}`);
        }

        // Small delay between sends
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (userError) {
        console.error(`❌ Error processing follow-up for ${followup.user_id}:`, userError);
      }
    }

    console.log(`📊 Follow-up complete: ${sentCount}/${followups?.length || 0} messages sent`);

    return new Response(JSON.stringify({
      status: 'success',
      totalConversations: followups?.length || 0,
      followupsSent: sentCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Conversation follow-up error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
