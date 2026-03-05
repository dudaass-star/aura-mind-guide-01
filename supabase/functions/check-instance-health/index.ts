import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InstanceRow {
  id: string;
  name: string;
  phone_number: string | null;
  zapi_instance_id: string;
  zapi_token: string;
  zapi_client_token: string;
  status: string;
}

interface HealthResult {
  instance_id: string;
  name: string;
  is_connected: boolean;
  smartphone_connected: boolean;
  error_message: string | null;
  response_raw: any;
  alert_sent: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Fetch all instances (active or disconnected - we check all)
    const { data: instances, error: fetchError } = await supabase
      .from('whatsapp_instances')
      .select('id, name, phone_number, zapi_instance_id, zapi_token, status')
      .in('status', ['active', 'disconnected']);

    if (fetchError) throw fetchError;
    if (!instances || instances.length === 0) {
      return new Response(JSON.stringify({ message: 'No instances to check' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: HealthResult[] = [];

    for (const instance of instances as InstanceRow[]) {
      const result = await checkInstance(supabase, instance);
      results.push(result);
    }

    // Summary
    const connected = results.filter(r => r.is_connected).length;
    const disconnected = results.filter(r => !r.is_connected).length;
    const alertsSent = results.filter(r => r.alert_sent).length;

    console.log(`✅ [Health Check] ${connected} connected, ${disconnected} disconnected, ${alertsSent} alerts sent`);

    return new Response(JSON.stringify({
      checked: results.length,
      connected,
      disconnected,
      alerts_sent: alertsSent,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ [Health Check] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function checkInstance(supabase: any, instance: InstanceRow): Promise<HealthResult> {
  const result: HealthResult = {
    instance_id: instance.id,
    name: instance.name,
    is_connected: false,
    smartphone_connected: false,
    error_message: null,
    response_raw: null,
    alert_sent: false,
  };

  try {
    // Call Z-API status endpoint
    const url = `https://api.z-api.io/instances/${instance.zapi_instance_id}/token/${instance.zapi_token}/status`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': instance.zapi_client_token,
      },
    });

    if (!response.ok) {
      result.error_message = `HTTP ${response.status}: ${await response.text()}`;
    } else {
      const data = await response.json();
      result.response_raw = data;

      // Z-API returns { connected: true/false, smartphoneConnected: true/false }
      result.is_connected = data.connected === true;
      result.smartphone_connected = data.smartphoneConnected === true;

      if (!result.is_connected) {
        result.error_message = `Not connected. Status: ${JSON.stringify(data)}`;
      }
    }
  } catch (error) {
    result.error_message = `Fetch error: ${error.message}`;
  }

  // Update whatsapp_instances table
  if (result.is_connected) {
    await supabase
      .from('whatsapp_instances')
      .update({
        status: 'active',
        last_health_check: new Date().toISOString(),
      })
      .eq('id', instance.id);
  } else {
    await supabase
      .from('whatsapp_instances')
      .update({
        status: 'disconnected',
        last_disconnected_at: new Date().toISOString(),
        last_health_check: new Date().toISOString(),
      })
      .eq('id', instance.id);

    // Check if we should send an alert (avoid spam: no alert in last 30 min)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recentAlerts } = await supabase
      .from('instance_health_logs')
      .select('id')
      .eq('instance_id', instance.id)
      .eq('alert_sent', true)
      .gte('checked_at', thirtyMinAgo)
      .limit(1);

    if (!recentAlerts || recentAlerts.length === 0) {
      // Send email alert
      const alertSent = await sendEmailAlert(instance, result);
      result.alert_sent = alertSent;
    }
  }

  // Log to instance_health_logs
  await supabase.from('instance_health_logs').insert({
    instance_id: instance.id,
    is_connected: result.is_connected,
    smartphone_connected: result.smartphone_connected,
    error_message: result.error_message,
    response_raw: result.response_raw,
    alert_sent: result.alert_sent,
  });

  return result;
}

async function sendEmailAlert(instance: InstanceRow, result: HealthResult): Promise<boolean> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const alertEmail = Deno.env.get('ADMIN_ALERT_EMAIL') || 'admin@example.com';

  if (!resendApiKey) {
    console.warn('⚠️ [Health Check] RESEND_API_KEY not configured, skipping email alert');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Aura Monitor <alertas@olaaura.com.br>',
        to: [alertEmail],
        subject: `🔴 ALERTA: Instância WhatsApp "${instance.name}" DESCONECTADA`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #dc2626;">🔴 Instância WhatsApp Desconectada</h2>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 8px; font-weight: bold;">Instância:</td><td style="padding: 8px;">${instance.name}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Telefone:</td><td style="padding: 8px;">${instance.phone_number || 'N/A'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Status:</td><td style="padding: 8px; color: #dc2626;">Desconectada</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Erro:</td><td style="padding: 8px;">${result.error_message || 'N/A'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Horário:</td><td style="padding: 8px;">${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td></tr>
            </table>
            <p style="color: #666;">Acesse o painel admin para verificar e reconectar: <a href="https://aura-mind-guide-01.lovable.app/admin/instancias">Ver Painel</a></p>
            <p style="color: #999; font-size: 12px;">Este alerta não será repetido pelos próximos 30 minutos para esta instância.</p>
          </div>
        `,
      }),
    });

    if (response.ok) {
      console.log(`📧 [Health Check] Alert email sent for instance ${instance.name}`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`❌ [Health Check] Email send failed: ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ [Health Check] Email error: ${error.message}`);
    return false;
  }
}
