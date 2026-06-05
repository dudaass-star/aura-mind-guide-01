/**
 * Lista os templates aprovados de um WhatsApp Business Account (WABA)
 * via Meta Graph API. Apenas leitura — não escreve na tabela
 * `whatsapp_templates`. O admin decide o mapeamento na UI.
 *
 * Requer:
 * - META_WHATSAPP_ACCESS_TOKEN (já existente)
 * - META_WHATSAPP_BUSINESS_ACCOUNT_ID (WABA ID — novo secret)
 *
 * Admin-only: valida JWT + role 'admin' em código.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_GRAPH_VERSION = 'v21.0';

interface MetaTemplateComponent {
  type: string;
  text?: string;
  format?: string;
  buttons?: Array<{ type: string; text?: string }>;
  example?: unknown;
}

interface MetaTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
  components?: MetaTemplateComponent[];
}

interface SimplifiedTemplate {
  name: string;
  language: string;
  category: string;
  body_text: string;
  header_text: string | null;
  footer_text: string | null;
  button_labels: string[];
  variables_count: number;
}

function simplify(t: MetaTemplate): SimplifiedTemplate {
  const components = t.components || [];
  const body = components.find(c => c.type?.toUpperCase() === 'BODY');
  const header = components.find(c => c.type?.toUpperCase() === 'HEADER');
  const footer = components.find(c => c.type?.toUpperCase() === 'FOOTER');
  const buttonsComp = components.find(c => c.type?.toUpperCase() === 'BUTTONS');
  const bodyText = body?.text || '';
  const variables = bodyText.match(/\{\{\d+\}\}/g) || [];
  return {
    name: t.name,
    language: t.language,
    category: t.category,
    body_text: bodyText,
    header_text: header?.text || null,
    footer_text: footer?.text || null,
    button_labels: (buttonsComp?.buttons || []).map(b => b.text || '').filter(Boolean),
    variables_count: variables.length,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Validação admin
    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('Missing authorization header');
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Unauthorized');

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isAdmin } = await serviceClient.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) throw new Error('Forbidden: admin role required');

    const token = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
    const wabaId = Deno.env.get('META_WHATSAPP_BUSINESS_ACCOUNT_ID');
    if (!token) throw new Error('META_WHATSAPP_ACCESS_TOKEN não configurado');
    if (!wabaId) throw new Error('META_WHATSAPP_BUSINESS_ACCOUNT_ID não configurado — cadastre o WABA ID do número novo');

    // Paginação Graph API
    const all: MetaTemplate[] = [];
    let url: string | null =
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${wabaId}/message_templates` +
      `?fields=name,language,status,category,components&limit=200`;

    let pageCount = 0;
    while (url && pageCount < 10) {
      pageCount++;
      const r: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (!r.ok) {
        throw new Error(`Meta Graph error [${r.status}]: ${JSON.stringify(j)}`);
      }
      if (Array.isArray(j.data)) all.push(...(j.data as MetaTemplate[]));
      url = j.paging?.next || null;
    }

    const approved = all.filter(t => (t.status || '').toUpperCase() === 'APPROVED').map(simplify);
    const others = all.filter(t => (t.status || '').toUpperCase() !== 'APPROVED').map(t => ({
      name: t.name, language: t.language, status: t.status, category: t.category,
    }));

    return new Response(JSON.stringify({
      waba_id: wabaId,
      total: all.length,
      approved_count: approved.length,
      approved,
      others,
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [meta-templates-sync]', msg);
    const status = msg.includes('Unauthorized') || msg.includes('Forbidden') ? 403 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});