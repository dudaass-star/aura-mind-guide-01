import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Wifi, WifiOff, Clock, Users, ArrowLeft, Loader2, CreditCard, MessageSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';

interface Instance {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
  current_users: number;
  max_users: number;
  last_health_check: string | null;
  last_disconnected_at: string | null;
}

interface HealthLog {
  id: string;
  instance_id: string;
  checked_at: string;
  is_connected: boolean;
  smartphone_connected: boolean;
  error_message: string | null;
  alert_sent: boolean;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Agora';
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

export default function AdminInstances() {
  const { isLoading: authLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<any>(null);
  const [showReconcileDialog, setShowReconcileDialog] = useState(false);
  const [notifying, setNotifying] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    redirectIfNotAdmin();
  }, [authLoading, isAdmin]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: inst } = await supabase
        .from('whatsapp_instances')
        .select('id, name, phone_number, status, current_users, max_users, last_health_check, last_disconnected_at')
        .order('name');

      // Fetch last 50 health logs
      const { data: logs } = await supabase
        .from('instance_health_logs')
        .select('id, instance_id, checked_at, is_connected, smartphone_connected, error_message, alert_sent')
        .order('checked_at', { ascending: false })
        .limit(50);

      setInstances((inst as Instance[]) || []);
      setHealthLogs((logs as HealthLog[]) || []);
    } catch (err) {
      console.error('Error fetching instances:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin, fetchData]);

  const runHealthCheck = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-instance-health');
      if (error) throw error;
      toast({
        title: 'Health check concluído',
        description: `${data.connected} conectadas, ${data.disconnected} desconectadas`,
      });
      await fetchData();
    } catch (err: any) {
      toast({
        title: 'Erro no health check',
        description: err.message,
        variant: 'destructive',
      });
    }
    setChecking(false);
  };

  const runReconciliation = async (dryRun = false) => {
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke('reconcile-subscriptions', {
        body: { dry_run: dryRun },
      });
      if (error) throw error;
      setReconcileResult(data);
      setShowReconcileDialog(true);
      toast({
        title: 'Reconciliação concluída',
        description: `${data.inconsistencies_found} inconsistências encontradas`,
      });
    } catch (err: any) {
      toast({
        title: 'Erro na reconciliação',
        description: err.message,
        variant: 'destructive',
      });
    }
    setReconciling(false);
  };


  const notifyReconnect = async (instanceId: string) => {
    setNotifying(prev => new Set(prev).add(instanceId));
    try {
      const { data, error } = await supabase.functions.invoke('instance-reconnect-notify', {
        body: { instance_id: instanceId },
      });
      if (error) throw error;
      toast({
        title: 'Notificação enviada',
        description: `${data.sent} enviadas, ${data.errors} erros (total: ${data.total})`,
      });
    } catch (err: any) {
      toast({
        title: 'Erro ao notificar',
        description: err.message,
        variant: 'destructive',
      });
    }
    setNotifying(prev => { const s = new Set(prev); s.delete(instanceId); return s; });
  };

  if (authLoading || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const connectedCount = instances.filter(i => i.status === 'active').length;
  const disconnectedCount = instances.filter(i => i.status === 'disconnected').length;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/testes')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Monitoramento WhatsApp</h1>
              <p className="text-sm text-muted-foreground">Status das instâncias Z-API em tempo real</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => runReconciliation(false)} disabled={reconciling} variant="outline">
              {reconciling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              Reconciliar Stripe
            </Button>
            <Button onClick={runHealthCheck} disabled={checking} variant="sage">
              {checking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Verificar Agora
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Wifi className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{connectedCount}</p>
                  <p className="text-sm text-muted-foreground">Conectadas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
                  <WifiOff className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{disconnectedCount}</p>
                  <p className="text-sm text-muted-foreground">Desconectadas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{instances.reduce((s, i) => s + i.current_users, 0)}</p>
                  <p className="text-sm text-muted-foreground">Usuários totais</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Instances Table */}
        <Card>
          <CardHeader>
            <CardTitle>Instâncias</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Usuários</TableHead>
                    <TableHead>Último Check</TableHead>
                    <TableHead>Última Queda</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instances.map((inst) => (
                    <TableRow key={inst.id}>
                      <TableCell>
                        {inst.status === 'active' ? (
                          <Badge className="bg-green-500/20 text-green-600 border-green-500/30">
                            <Wifi className="h-3 w-3 mr-1" /> Online
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <WifiOff className="h-3 w-3 mr-1" /> Offline
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{inst.name}</TableCell>
                      <TableCell className="text-muted-foreground">{inst.phone_number || '—'}</TableCell>
                      <TableCell>
                        <span className="font-medium">{inst.current_users}</span>
                        <span className="text-muted-foreground">/{inst.max_users}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(inst.last_health_check)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inst.last_disconnected_at ? formatTimeAgo(inst.last_disconnected_at) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Health Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico Recente</CardTitle>
          </CardHeader>
          <CardContent>
            {healthLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum registro de health check ainda. Clique em "Verificar Agora".</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Horário</TableHead>
                    <TableHead>Instância</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Celular</TableHead>
                    <TableHead>Alerta</TableHead>
                    <TableHead>Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {healthLogs.map((log) => {
                    const inst = instances.find(i => i.id === log.instance_id);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">
                          {new Date(log.checked_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </TableCell>
                        <TableCell className="font-medium">{inst?.name || log.instance_id.substring(0, 8)}</TableCell>
                        <TableCell>
                          {log.is_connected ? (
                            <Badge className="bg-green-500/20 text-green-600 border-green-500/30">✓</Badge>
                          ) : (
                            <Badge variant="destructive">✗</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {log.smartphone_connected ? '📱' : '❌'}
                        </TableCell>
                        <TableCell>
                          {log.alert_sent ? '📧' : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {log.error_message || '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation Results Dialog */}
      <Dialog open={showReconcileDialog} onOpenChange={setShowReconcileDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resultado da Reconciliação Stripe</DialogTitle>
          </DialogHeader>
          {reconcileResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground">Assinaturas ativas no Stripe</p>
                  <p className="text-2xl font-bold">{reconcileResult.total_active_subscriptions}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground">Inconsistências encontradas</p>
                  <p className="text-2xl font-bold">{reconcileResult.inconsistencies_found}</p>
                </div>
              </div>

              {reconcileResult.fixes?.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Correções</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Problema</TableHead>
                        <TableHead>Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reconcileResult.fixes.map((fix: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{fix.name}</TableCell>
                          <TableCell className="text-muted-foreground">{fix.phone}</TableCell>
                          <TableCell className="text-sm">{fix.issue}</TableCell>
                          <TableCell>
                            <Badge variant={fix.action === 'Corrigido' ? 'default' : 'secondary'}>
                              {fix.action}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {reconcileResult.errors?.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 text-destructive">Erros</h3>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {reconcileResult.errors.map((err: any, i: number) => (
                      <li key={i}>• {err.error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {reconcileResult.fixes?.length === 0 && reconcileResult.errors?.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  ✅ Tudo consistente! Nenhuma divergência encontrada.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
