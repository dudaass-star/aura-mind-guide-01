import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Play, CheckCircle, XCircle, Clock, Loader2, Pause, X } from "lucide-react";
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

interface ChunkStatus {
  chunk_index: number;
  total_chunks: number;
  status: string;
  error_message?: string;
}

interface MeditationWithAudio extends Meditation {
  audio?: MeditationAudio;
  scriptLength: number;
  chunks?: ChunkStatus[];
  generationProgress?: number;
}

// Divide script em chunks (mesmo algoritmo do backend)
function splitScriptIntoChunks(script: string, maxChars = 1200): string[] {
  const chunks: string[] = [];
  const sentences = script.split(/(?<=[.!?])\s+|(?<=\.\.\.)\s*/);
  let currentChunk = "";

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    
    if (currentChunk.length + sentence.length + 1 > maxChars) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export default function AdminMeditations() {
  const [meditations, setMeditations] = useState<MeditationWithAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<{[key: string]: {current: number, total: number, status: string}}>({});
  const [isPaused, setIsPaused] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
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

      // Fetch chunk progress
      const { data: chunksData } = await supabase
        .from("meditation_audio_chunks")
        .select("*")
        .order("chunk_index");

      // Merge data
      const audioMap = new Map(audiosData?.map((a) => [a.meditation_id, a]));
      const chunksMap = new Map<string, ChunkStatus[]>();
      
      chunksData?.forEach((c) => {
        if (!chunksMap.has(c.meditation_id)) {
          chunksMap.set(c.meditation_id, []);
        }
        chunksMap.get(c.meditation_id)!.push(c);
      });

      const merged: MeditationWithAudio[] = (meditationsData || []).map((m) => {
        const chunks = chunksMap.get(m.id);
        let progress = 0;
        if (chunks && chunks.length > 0) {
          const completed = chunks.filter(c => c.status === 'completed').length;
          progress = Math.round((completed / chunks[0].total_chunks) * 100);
        }
        
        return {
          ...m,
          audio: audioMap.get(m.id),
          scriptLength: m.script?.length || 0,
          chunks,
          generationProgress: progress,
        };
      });

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

  // Polling para atualizar progresso durante geração
  useEffect(() => {
    if (!generating) return;

    const interval = setInterval(async () => {
      const { data: chunks } = await supabase
        .from("meditation_audio_chunks")
        .select("*")
        .eq("meditation_id", generating)
        .order("chunk_index");

      if (chunks && chunks.length > 0) {
        const completed = chunks.filter(c => c.status === 'completed').length;
        const failed = chunks.filter(c => c.status === 'failed').length;
        const current = chunks.find(c => c.status === 'generating')?.chunk_index ?? completed;
        
        setGenerationStatus(prev => ({
          ...prev,
          [generating]: {
            current: completed,
            total: chunks[0].total_chunks,
            status: failed > 0 ? 'error' : (completed === chunks[0].total_chunks ? 'finalizing' : 'generating')
          }
        }));
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [generating]);

  const startChunkedGeneration = async (meditationId: string) => {
    const meditation = meditations.find(m => m.id === meditationId);
    if (!meditation) return;

    setGenerating(meditationId);
    setIsPaused(false);
    abortControllerRef.current = new AbortController();

    try {
      // Dividir script em chunks
      const scriptChunks = splitScriptIntoChunks(meditation.script);
      const totalChunks = scriptChunks.length;

      console.log(`Starting generation: ${totalChunks} chunks for ${meditationId}`);

      setGenerationStatus(prev => ({
        ...prev,
        [meditationId]: { current: 0, total: totalChunks, status: 'generating' }
      }));

      // Gerar chunks sequencialmente
      for (let i = 0; i < totalChunks; i++) {
        // Verificar se foi cancelado ou pausado
        if (abortControllerRef.current?.signal.aborted) {
          console.log('Generation cancelled');
          break;
        }

        if (isPaused) {
          console.log('Generation paused');
          break;
        }

        console.log(`Generating chunk ${i + 1}/${totalChunks}...`);

        const response = await supabase.functions.invoke("generate-chunk", {
          body: { 
            meditation_id: meditationId, 
            chunk_index: i,
            // Na primeira chamada, inicializar todos os registros
            ...(i === 0 && { initialize: true, total_chunks: totalChunks })
          },
        });

        if (response.error) {
          throw new Error(response.error.message || `Error generating chunk ${i}`);
        }

        setGenerationStatus(prev => ({
          ...prev,
          [meditationId]: { current: i + 1, total: totalChunks, status: 'generating' }
        }));
      }

      // Verificar se foi cancelado
      if (abortControllerRef.current?.signal.aborted || isPaused) {
        toast({
          title: isPaused ? "Geração pausada" : "Geração cancelada",
          description: "Você pode retomar a geração depois.",
        });
        setGenerating(null);
        await fetchMeditations();
        return;
      }

      // Finalizar - concatenar todos os chunks
      setGenerationStatus(prev => ({
        ...prev,
        [meditationId]: { ...prev[meditationId], status: 'finalizing' }
      }));

      console.log('Finalizing meditation audio...');
      const finalResponse = await supabase.functions.invoke("finalize-meditation-audio", {
        body: { meditation_id: meditationId },
      });

      if (finalResponse.error) {
        throw new Error(finalResponse.error.message || 'Error finalizing audio');
      }

      toast({
        title: "Sucesso!",
        description: `Áudio gerado com ${totalChunks} chunks.`,
      });

      await fetchMeditations();
    } catch (error) {
      console.error("Error in chunked generation:", error);
      toast({
        title: "Erro na geração",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setGenerating(null);
      setGenerationStatus(prev => {
        const newState = { ...prev };
        delete newState[meditationId];
        return newState;
      });
    }
  };

  const resumeGeneration = async (meditationId: string) => {
    const meditation = meditations.find(m => m.id === meditationId);
    if (!meditation || !meditation.chunks) return;

    setGenerating(meditationId);
    setIsPaused(false);
    abortControllerRef.current = new AbortController();

    try {
      const totalChunks = meditation.chunks[0]?.total_chunks || 0;
      const pendingChunks = meditation.chunks
        .filter(c => c.status !== 'completed')
        .map(c => c.chunk_index);

      console.log(`Resuming generation: ${pendingChunks.length} pending chunks`);

      for (const chunkIndex of pendingChunks) {
        if (abortControllerRef.current?.signal.aborted || isPaused) break;

        console.log(`Generating chunk ${chunkIndex + 1}/${totalChunks}...`);

        const response = await supabase.functions.invoke("generate-chunk", {
          body: { meditation_id: meditationId, chunk_index: chunkIndex },
        });

        if (response.error) {
          throw new Error(response.error.message);
        }
      }

      if (abortControllerRef.current?.signal.aborted || isPaused) {
        setGenerating(null);
        await fetchMeditations();
        return;
      }

      // Finalizar
      const finalResponse = await supabase.functions.invoke("finalize-meditation-audio", {
        body: { meditation_id: meditationId },
      });

      if (finalResponse.error) {
        throw new Error(finalResponse.error.message);
      }

      toast({
        title: "Sucesso!",
        description: "Áudio gerado com sucesso.",
      });

      await fetchMeditations();
    } catch (error) {
      console.error("Error resuming generation:", error);
      toast({
        title: "Erro na geração",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setGenerating(null);
    }
  };

  const cancelGeneration = () => {
    abortControllerRef.current?.abort();
    setGenerating(null);
  };

  const pauseGeneration = () => {
    setIsPaused(true);
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
    const status = generationStatus[med.id];
    
    if (generating === med.id) {
      if (status?.status === 'finalizing') {
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Finalizando...
          </Badge>
        );
      }
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          {status ? `${status.current}/${status.total}` : 'Iniciando...'}
        </Badge>
      );
    }
    
    // Tem chunks pendentes (geração em progresso ou pausada)
    if (med.chunks && med.chunks.length > 0) {
      const completed = med.chunks.filter(c => c.status === 'completed').length;
      const total = med.chunks[0].total_chunks;
      const hasFailed = med.chunks.some(c => c.status === 'failed');
      
      if (hasFailed) {
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Erro ({completed}/{total})
          </Badge>
        );
      }
      
      return (
        <Badge variant="outline" className="gap-1">
          <Pause className="h-3 w-3" />
          Pausado ({completed}/{total})
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

  const getChunkCount = (script: string) => {
    return splitScriptIntoChunks(script).length;
  };

  const totalWithAudio = meditations.filter((m) => m.audio).length;
  const totalMeditations = meditations.length;
  const totalInProgress = meditations.filter(m => m.chunks && m.chunks.length > 0).length;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Admin - Meditações</h1>
            <p className="text-muted-foreground">
              Geração de áudio em chunks (sem timeout!)
            </p>
          </div>
          <Button onClick={fetchMeditations} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total
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
                {totalMeditations - totalWithAudio - totalInProgress}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Em Progresso
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-accent-foreground">{totalInProgress}</p>
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
                      <TableHead>Chunks</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progresso</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {meditations.map((med) => {
                      const status = generationStatus[med.id];
                      const isGenerating = generating === med.id;
                      const hasPendingChunks = med.chunks && med.chunks.length > 0;
                      const chunkCount = getChunkCount(med.script);
                      
                      return (
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
                            <span className="text-sm font-medium">{chunkCount}</span>
                          </TableCell>
                          <TableCell>{getStatusBadge(med)}</TableCell>
                          <TableCell>
                            {isGenerating && status ? (
                              <div className="w-32">
                                <Progress 
                                  value={(status.current / status.total) * 100} 
                                  className="h-2"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  {status.status === 'finalizing' 
                                    ? 'Juntando áudios...' 
                                    : `Chunk ${status.current + 1} de ${status.total}`}
                                </p>
                              </div>
                            ) : hasPendingChunks ? (
                              <div className="w-32">
                                <Progress 
                                  value={med.generationProgress || 0} 
                                  className="h-2"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  {med.generationProgress}% completo
                                </p>
                              </div>
                            ) : med.audio ? (
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
                              
                              {isGenerating ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={pauseGeneration}
                                  >
                                    <Pause className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={cancelGeneration}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : hasPendingChunks ? (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => resumeGeneration(med.id)}
                                  disabled={generating !== null}
                                >
                                  <Play className="h-4 w-4 mr-1" />
                                  Retomar
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant={med.audio ? "outline" : "default"}
                                  onClick={() => startChunkedGeneration(med.id)}
                                  disabled={generating !== null}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  <span className="ml-1 hidden md:inline">
                                    {med.audio ? "Regenerar" : "Gerar"}
                                  </span>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-primary">✨ Sistema de Chunks</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              O áudio é gerado em <strong>partes de ~1.200 caracteres</strong> (~20s cada), 
              evitando o timeout de 60 segundos.
            </p>
            <p>
              <strong>Vantagens:</strong> Sem timeout, progresso visível, retomável se pausar.
            </p>
            <p>
              <strong>Como funciona:</strong> Script é dividido → cada chunk é gerado separadamente → 
              ao final, todos são concatenados em um único MP3.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
