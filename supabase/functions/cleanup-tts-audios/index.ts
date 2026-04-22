import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET = 'aura-tts-audios';
const TTL_DAYS = 7;
const MAX_DELETE_PER_RUN = 1000;

async function listAllOldFiles(supabase: ReturnType<typeof createClient>, cutoff: Date): Promise<string[]> {
  const collected: string[] = [];

  // Lista as pastas (top-level): cada user_id ou "shared"
  const { data: folders, error: foldersErr } = await supabase.storage
    .from(BUCKET)
    .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

  if (foldersErr) {
    console.error('❌ Error listing folders:', foldersErr);
    return collected;
  }

  for (const folder of folders || []) {
    if (collected.length >= MAX_DELETE_PER_RUN) break;
    const folderName = folder.name;
    let offset = 0;
    while (collected.length < MAX_DELETE_PER_RUN) {
      const { data: files, error } = await supabase.storage
        .from(BUCKET)
        .list(folderName, { limit: 100, offset, sortBy: { column: 'created_at', order: 'asc' } });

      if (error) {
        console.error(`❌ Error listing ${folderName}:`, error);
        break;
      }
      if (!files || files.length === 0) break;

      for (const f of files) {
        if (!f.name) continue;
        // pastas vêm sem id; arquivos têm id
        if (!f.id) continue;
        const createdAt = f.created_at ? new Date(f.created_at) : null;
        if (createdAt && createdAt < cutoff) {
          collected.push(`${folderName}/${f.name}`);
          if (collected.length >= MAX_DELETE_PER_RUN) break;
        }
      }
      if (files.length < 100) break;
      offset += 100;
    }
  }

  return collected;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const cutoff = new Date(Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000);
    console.log(`🧹 [cleanup-tts-audios] Looking for files older than ${cutoff.toISOString()}`);

    const toDelete = await listAllOldFiles(supabase, cutoff);
    console.log(`🧹 [cleanup-tts-audios] Found ${toDelete.length} files to delete`);

    if (toDelete.length === 0) {
      return new Response(JSON.stringify({ deleted: 0, cutoff: cutoff.toISOString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: deleted, error: deleteErr } = await supabase.storage
      .from(BUCKET)
      .remove(toDelete);

    if (deleteErr) {
      console.error('❌ Delete error:', deleteErr);
      return new Response(JSON.stringify({ error: deleteErr.message, attempted: toDelete.length }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ [cleanup-tts-audios] Deleted ${deleted?.length ?? 0} files`);

    return new Response(JSON.stringify({
      deleted: deleted?.length ?? 0,
      cutoff: cutoff.toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ cleanup-tts-audios exception:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
