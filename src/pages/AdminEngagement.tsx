import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Users, MessageSquare, Clock, BarChart3, RefreshCw, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Metrics {
  activeUsers: number;
  weeklyMessages: number;
  weeklySessionsCount: number;
  avgSessionMinutes: number;
  messagesPerSession: number;
  returnRate: number;
  uniqueRecentUsers: number;
  avgDailyMessagesPerUser: number;
}

export default function AdminEngagement() {
  const { isLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) redirectIfNotAdmin();
  }, [isLoading, isAdmin]);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const { data, error } = await supabase.functions.invoke('admin-engagement-metrics', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      setMetrics(data);
    } catch (err: unknown) {
      console.error('Error fetching metrics:', err);
      toast({
        title: 'Erro ao carregar métricas',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchMetrics();
  }, [isAdmin]);

  if (isLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const cards = metrics ? [
    { title: 'Usuários Ativos', value: metrics.activeUsers, icon: Users, subtitle: 'status = active' },
    { title: 'Mensagens na Semana', value: metrics.weeklyMessages, icon: MessageSquare, subtitle: 'últimos 7 dias' },
    { title: 'Sessões Completadas', value: metrics.weeklySessionsCount, icon: BarChart3, subtitle: 'últimos 7 dias' },
    { title: 'Tempo Médio de Sessão', value: `${metrics.avgSessionMinutes} min`, icon: Clock, subtitle: 'sessões completadas' },
    { title: 'Mensagens por Sessão', value: metrics.messagesPerSession, icon: MessageSquare, subtitle: 'msgs do usuário durante sessão' },
    { title: 'Média Msgs/Dia por Usuário', value: metrics.avgDailyMessagesPerUser, icon: TrendingUp, subtitle: 'últimos 7 dias / ativos' },
    { title: 'Taxa de Retorno', value: `${metrics.returnRate}%`, icon: TrendingUp, subtitle: `${metrics.uniqueRecentUsers} de ${metrics.activeUsers} ativos` },
  ] : [];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/configuracoes')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Métricas de Engajamento</h1>
          </div>
          <Button variant="outline" size="sm" onClick={fetchMetrics} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {loading && !metrics ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-2"><div className="h-4 bg-muted rounded w-32" /></CardHeader>
                <CardContent><div className="h-8 bg-muted rounded w-20" /></CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card) => (
              <Card key={card.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                  <card.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{card.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
