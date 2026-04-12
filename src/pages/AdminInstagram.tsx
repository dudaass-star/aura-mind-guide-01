import { useEffect, useState } from "react";
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
import { Instagram, MessageCircle, ThumbsUp, ThumbsDown, HelpCircle, Minus, RefreshCw } from "lucide-react";

interface Interaction {
  id: string;
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
}

export default function AdminInstagram() {
  const { isLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const { toast } = useToast();
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);

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
        .select("*")
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

  const sentimentIcon = (s: string | null) => {
    switch (s) {
      case "positive": return <ThumbsUp className="h-4 w-4 text-green-500" />;
      case "negative": return <ThumbsDown className="h-4 w-4 text-red-500" />;
      case "question": return <HelpCircle className="h-4 w-4 text-blue-500" />;
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
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
        </div>

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
