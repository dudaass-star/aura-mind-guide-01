import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Play, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Meditation {
  id: string;
  title: string;
  category: string;
  duration_seconds: number;
  script: string;
  is_active: boolean;
}

interface MeditationAudio {
  meditation_id: string;
  public_url: string;
  duration_seconds: number | null;
  generated_at: string;
}

interface MeditationWithAudio extends Meditation {
  audio?: MeditationAudio;
  scriptLength: number;
}

export default function AdminMeditations() {
  const [meditations, setMeditations] = useState<MeditationWithAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchMeditations = async () => {
    setLoading(true);
    try {
      // Fetch meditations
      const { data: meditationsData, error: medError } = await supabase
        .from("meditations")
        .select("*")
        .order("category");

      if (medError) throw medError;

      // Fetch audios
      const { data: audiosData, error: audioError } = await supabase
        .from("meditation_audios")
        .select("*");

      if (audioError) throw audioError;

      // Merge data
      const audioMap = new Map(audiosData?.map((a) => [a.meditation_id, a]));
      const merged: MeditationWithAudio[] = (meditationsData || []).map((m) => ({
        ...m,
        audio: audioMap.get(m.id),
        scriptLength: m.script?.length || 0,
      }));

      setMeditations(merged);
    } catch (error) {
      console.error("Error fetching meditations:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as meditações.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeditations();
  }, []);

  const generateAudio = async (meditationId: string) => {
    setGenerating(meditationId);
    try {
      const response = await supabase.functions.invoke("generate-meditation-audio", {
        body: { meditation_id: meditationId },
      });

      if (response.error) {
        throw new Error(response.error.message || "Erro na geração");
      }

      toast({
        title: "Sucesso!",
        description: "Áudio gerado com sucesso.",
      });

      // Refresh data
      await fetchMeditations();
    } catch (error) {
      console.error("Error generating audio:", error);
      toast({
        title: "Erro na geração",
        description: error instanceof Error ? error.message : "Timeout ou erro na API",
        variant: "destructive",
      });
    } finally {
      setGenerating(null);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (med: MeditationWithAudio) => {
    if (generating === med.id) {
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Gerando...
        </Badge>
      );
    }
    if (med.audio) {
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle className="h-3 w-3" />
          Pronto
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Sem áudio
      </Badge>
    );
  };

  const totalWithAudio = meditations.filter((m) => m.audio).length;
  const totalMeditations = meditations.length;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Admin - Meditações</h1>
            <p className="text-muted-foreground">
              Gerencie os áudios das meditações guiadas
            </p>
          </div>
          <Button onClick={fetchMeditations} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Meditações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalMeditations}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Com Áudio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">{totalWithAudio}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pendentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">
                {totalMeditations - totalWithAudio}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Meditações</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Script</TableHead>
                      <TableHead>Duração Est.</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Gerado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {meditations.map((med) => (
                      <TableRow key={med.id}>
                        <TableCell className="font-medium">{med.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{med.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground text-sm">
                            {med.scriptLength.toLocaleString()} chars
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1 text-sm">
                            <Clock className="h-3 w-3" />
                            {formatDuration(med.duration_seconds)}
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(med)}</TableCell>
                        <TableCell>
                          {med.audio ? (
                            <span className="text-sm text-muted-foreground">
                              {formatDate(med.audio.generated_at)}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {med.audio && (
                              <Button
                                size="sm"
                                variant="ghost"
                                asChild
                              >
                                <a
                                  href={med.audio.public_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Play className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={med.audio ? "outline" : "default"}
                              onClick={() => generateAudio(med.id)}
                              disabled={generating !== null}
                            >
                              {generating === med.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                              <span className="ml-1 hidden md:inline">
                                {med.audio ? "Regenerar" : "Gerar"}
                              </span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-accent bg-accent/10">
          <CardHeader>
            <CardTitle className="text-accent-foreground">⚠️ Limitações de Timeout</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              A geração de áudio tem um limite de <strong>60 segundos</strong> por execução.
            </p>
            <p>
              Scripts com mais de ~2.000 caracteres podem falhar por timeout. 
              As meditações maiores (Ansiedade, Sono, Estresse) precisam de scripts reduzidos.
            </p>
            <p>
              <strong>Recomendação:</strong> Scripts de até ~1.500 caracteres (~2 min de áudio) 
              funcionam consistentemente dentro do limite.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
