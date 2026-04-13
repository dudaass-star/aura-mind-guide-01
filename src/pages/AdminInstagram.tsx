import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Instagram, MessageCircle, ThumbsUp, ThumbsDown, HelpCircle, Minus, RefreshCw, Link2, CheckCircle2, AlertTriangle } from "lucide-react";

interface Interaction {
  id: string;
  ig_user_id: string;
  ig_username: string | null;
  interaction_type: string;
  original_text: string;
  response_text: string | null;
  sentiment: string | null;
  responded: boolean;
  created_at: string;
}

interface Config {
  response_enabled: boolean;
  comment_response_enabled: boolean;
  dm_response_enabled: boolean;
  max_daily_responses: number;
  daily_count: number;
  ig_account_id: string | null;
  comment_keywords: string[];
  meta_access_token: string | null;
  token_expires_at: string | null;
}

export default function AdminInstagram() {
  const { isLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const { toast } = useToast();
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle OAuth callback results
  useEffect(() => {
    const oauthSuccess = searchParams.get("oauth_success");
    const oauthError = searchParams.get("oauth_error");
    const pageName = searchParams.get("page");

    if (oauthSuccess) {
      toast({ title: "Instagram conectado! ✅", description: pageName ? `Página: ${pageName}` : "Token salvo com sucesso." });
      setSearchParams({}, { replace: true });
      loadData();
    } else if (oauthError) {
      toast({ title: "Erro na conexão", description: decodeURIComponent(oauthError), variant: "destructive" });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isLoading) redirectIfNotAdmin();
  }, [isLoading, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const loadData = async () => {
    setLoading(true);
    const [interactionsRes, configRes] = await Promise.all([
      supabase
        .from("instagram_interactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("instagram_config")
        .select("*, meta_access_token, token_expires_at")
        .eq("id", 1)
        .single(),
    ]);

    if (interactionsRes.data) setInteractions(interactionsRes.data as Interaction[]);
    if (configRes.data) setConfig(configRes.data as unknown as Config);
    setLoading(false);
  };

  const updateConfig = async (updates: Partial<Config>) => {
    const { error } = await supabase
      .from("instagram_config")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", 1);

    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      setConfig(prev => prev ? { ...prev, ...updates } : null);
      toast({ title: "Configuração atualizada" });
    }
  };

  const handleConnectInstagram = () => {
    const appId = "1491408882345218";
    const redirectUri = encodeURIComponent(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-oauth-callback`);
    const state = encodeURIComponent(window.location.origin);
    const scopes = "pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata,business_management,instagram_basic,instagram_manage_comments,instagram_manage_messages";
    const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scopes}&state=${state}&response_type=code`;
    window.location.href = oauthUrl;
  };

  const tokenStatus = () => {
    if (!config?.meta_access_token) return { label: "Não conectado", color: "destructive" as const, icon: AlertTriangle };
    if (config.token_expires_at) {
      const days = Math.round((new Date(config.token_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (days > 30) return { label: `Token válido (${days} dias)`, color: "default" as const, icon: CheckCircle2 };
      if (days > 0) return { label: `Expira em ${days} dias`, color: "secondary" as const, icon: AlertTriangle };
    }
    return { label: "Token configurado", color: "default" as const, icon: CheckCircle2 };
  };

  const sentimentIcon = (s: string | null) => {
    switch (s) {
      case "positive": return <ThumbsUp className="h-4 w-4 text-primary" />;
      case "negative": return <ThumbsDown className="h-4 w-4 text-destructive" />;
      case "question": return <HelpCircle className="h-4 w-4 text-accent-foreground" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const stats = {
    today: interactions.filter(i => {
      const d = new Date(i.created_at);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length,
    responded: interactions.filter(i => i.responded).length,
    comments: interactions.filter(i => i.interaction_type === "comment").length,
    dms: interactions.filter(i => i.interaction_type === "dm").length,
  };

  if (isLoading || loading) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Carregando...</div>;
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Instagram className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Instagram — Automação</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
            </Button>
          </div>
        </div>

        {/* Connection Status */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(() => {
                  const status = tokenStatus();
                  const Icon = status.icon;
                  return (
                    <>
                      <Icon className={`h-5 w-5 ${status.color === "destructive" ? "text-destructive" : "text-primary"}`} />
                      <div>
                        <p className="text-sm font-medium text-foreground">Conexão com Meta</p>
                        <Badge variant={status.color}>{status.label}</Badge>
                      </div>
                    </>
                  );
                })()}
              </div>
              <Button onClick={handleConnectInstagram} variant={config?.meta_access_token ? "outline" : "default"} size="sm">
                <Link2 className="h-4 w-4 mr-2" />
                {config?.meta_access_token ? "Reconectar" : "Conectar Instagram"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Hoje</p>
              <p className="text-3xl font-bold text-foreground">{stats.today}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Respondidas</p>
              <p className="text-3xl font-bold text-foreground">{stats.responded}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Comentários</p>
              <p className="text-3xl font-bold text-foreground">{stats.comments}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">DMs</p>
              <p className="text-3xl font-bold text-foreground">{stats.dms}</p>
            </CardContent>
          </Card>
        </div>

        {/* Config */}
        {config && (
          <Card>
            <CardHeader>
              <CardTitle>Configurações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Respostas ativadas</span>
                <Switch
                  checked={config.response_enabled}
                  onCheckedChange={(v) => updateConfig({ response_enabled: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Responder comentários</span>
                <Switch
                  checked={config.comment_response_enabled}
                  onCheckedChange={(v) => updateConfig({ comment_response_enabled: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Responder DMs</span>
                <Switch
                  checked={config.dm_response_enabled}
                  onCheckedChange={(v) => updateConfig({ dm_response_enabled: v })}
                />
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-foreground whitespace-nowrap">Limite diário</span>
                <Input
                  type="number"
                  value={config.max_daily_responses}
                  onChange={(e) => updateConfig({ max_daily_responses: parseInt(e.target.value) || 100 })}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">
                  ({config.daily_count} usado hoje)
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Interactions */}
        <Card>
          <CardHeader>
            <CardTitle>Interações Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {interactions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhuma interação registrada ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead>Resposta</TableHead>
                    <TableHead>Sentimento</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interactions.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <Badge variant={i.interaction_type === "comment" ? "secondary" : "outline"}>
                          {i.interaction_type === "comment" ? (
                            <><MessageCircle className="h-3 w-3 mr-1" /> Coment.</>
                          ) : (
                            <><Instagram className="h-3 w-3 mr-1" /> DM</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {i.ig_username ? `@${i.ig_username}` : i.ig_user_id?.slice(0, 8)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{i.original_text}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {i.responded ? i.response_text : (
                          <span className="text-muted-foreground italic">Não respondida</span>
                        )}
                      </TableCell>
                      <TableCell>{sentimentIcon(i.sentiment)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(i.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
