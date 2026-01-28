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
  created_at?: string;
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

// Aguarda um chunk completar via polling
async function waitForChunkCompletion(
  meditationId: string, 
  chunkIndex: number,
  onProgress?: (completed: number, total: number) => void
): Promise<boolean> {
  const maxWait = 300000; // 5 minutos
  const pollInterval = 3000; // 3 segundos
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const { data, error } = await supabase
      .from('meditation_audio_chunks')
      .select('status, total_chunks')
      .eq('meditation_id', meditationId)
      .eq('chunk_index', chunkIndex)
      .single();

    if (error) {
      console.error('Error polling chunk status:', error);
      await new Promise(r => setTimeout(r, pollInterval));
      continue;
    }

    if (data?.status === 'completed') {
      // Buscar total de completos para atualizar progresso
      const { data: allChunks } = await supabase
        .from('meditation_audio_chunks')
        .select('status')
        .eq('meditation_id', meditationId);
      
      const completedCount = allChunks?.filter(c => c.status === 'completed').length || 0;
      onProgress?.(completedCount, data.total_chunks);
      
      return true;
    }
    
    if (data?.status === 'failed') {
      throw new Error(`Chunk ${chunkIndex} failed`);
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  throw new Error(`Chunk ${chunkIndex} timeout after ${maxWait / 1000}s`);
}

// Reseta chunks travados em "generating" há mais de 5 minutos
async function resetStuckChunks(meditationId: string): Promise<number> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  const { data: stuckChunks } = await supabase
    .from('meditation_audio_chunks')
    .select('chunk_index, created_at')
    .eq('meditation_id', meditationId)
    .eq('status', 'generating');

  if (!stuckChunks || stuckChunks.length === 0) return 0;

  // Resetar chunks travados
  const { error } = await supabase
    .from('meditation_audio_chunks')
    .update({ status: 'pending', error_message: 'Reset: stuck in generating' })
    .eq('meditation_id', meditationId)
    .eq('status', 'generating');

  if (error) {
    console.error('Error resetting stuck chunks:', error);
    return 0;
  }

  console.log(`Reset ${stuckChunks.length} stuck chunks`);
  return stuckChunks.length;
}

export default function AdminMeditations() {
  const [meditations, setMeditations] = useState<MeditationWithAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<{[key: string]: {current: number, total: number, status: string}}>({});
  const [isCancelled, setIsCancelled] = useState(false);
  const cancelRef = useRef(false);
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
    setIsCancelled(false);
    cancelRef.current = false;

    try {
      // Dividir script em chunks
      const scriptChunks = splitScriptIntoChunks(meditation.script);
      const totalChunks = scriptChunks.length;

      console.log(`Starting generation: ${totalChunks} chunks for ${meditationId}`);

      setGenerationStatus(prev => ({
        ...prev,
        [meditationId]: { current: 0, total: totalChunks, status: 'generating' }
      }));

      // Gerar chunks sequencialmente com modo async
      for (let i = 0; i < totalChunks; i++) {
        // Verificar se foi cancelado
        if (cancelRef.current) {
          console.log('Generation cancelled');
          break;
        }

        console.log(`Triggering chunk ${i + 1}/${totalChunks}...`);

        // Disparar geração em modo async (retorna imediatamente)
        const response = await supabase.functions.invoke("generate-chunk", {
          body: { 
            meditation_id: meditationId, 
            chunk_index: i,
            async: true, // Modo fire-and-forget
            ...(i === 0 && { initialize: true, total_chunks: totalChunks })
          },
        });

        if (response.error) {
          throw new Error(response.error.message || `Error triggering chunk ${i}`);
        }

        // Aguardar chunk completar via polling (sem manter conexão HTTP)
        try {
          await waitForChunkCompletion(meditationId, i, (completed, total) => {
            setGenerationStatus(prev => ({
              ...prev,
              [meditationId]: { current: completed, total, status: 'generating' }
            }));
          });
        } catch (pollError) {
          console.error(`Error waiting for chunk ${i}:`, pollError);
          throw pollError;
        }

        // Verificar cancelamento após cada chunk
        if (cancelRef.current) {
          console.log('Generation cancelled after chunk completion');
          break;
        }
      }

      // Verificar se foi cancelado
      if (cancelRef.current) {
        toast({
          title: "Geração cancelada",
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
    setIsCancelled(false);
    cancelRef.current = false;

    try {
      // Resetar chunks travados
      const resetCount = await resetStuckChunks(meditationId);
      if (resetCount > 0) {
        toast({
          title: "Chunks resetados",
          description: `${resetCount} chunks travados foram resetados.`,
        });
      }

      const totalChunks = meditation.chunks[0]?.total_chunks || 0;
      
      // Buscar chunks pendentes atualizados
      const { data: freshChunks } = await supabase
        .from('meditation_audio_chunks')
        .select('*')
        .eq('meditation_id', meditationId)
        .order('chunk_index');

      const pendingChunks = (freshChunks || [])
        .filter(c => c.status !== 'completed')
        .map(c => c.chunk_index);

      console.log(`Resuming generation: ${pendingChunks.length} pending chunks`);

      for (const chunkIndex of pendingChunks) {
        if (cancelRef.current) break;

        console.log(`Triggering chunk ${chunkIndex + 1}/${totalChunks}...`);

        const response = await supabase.functions.invoke("generate-chunk", {
          body: { 
            meditation_id: meditationId, 
            chunk_index: chunkIndex,
            async: true
          },
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        // Aguardar chunk completar via polling
        await waitForChunkCompletion(meditationId, chunkIndex, (completed, total) => {
          setGenerationStatus(prev => ({
            ...prev,
            [meditationId]: { current: completed, total, status: 'generating' }
          }));
        });
      }

      if (cancelRef.current) {
        setGenerating(null);
        await fetchMeditations();
        return;
      }

      // Finalizar
      setGenerationStatus(prev => ({
        ...prev,
        [meditationId]: { ...prev[meditationId], status: 'finalizing' }
      }));

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
    cancelRef.current = true;
    setIsCancelled(true);
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
              Geração de áudio em chunks com polling (sem timeout!)
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
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={cancelGeneration}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
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
            <CardTitle className="text-primary">✨ Sistema de Chunks com Polling</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              O áudio é gerado em <strong>partes de ~1.200 caracteres</strong> (~20s cada), 
              usando modo <strong>fire-and-forget</strong>.
            </p>
            <p>
              <strong>Vantagens:</strong> Sem timeout de conexão, geração continua em background, 
              progresso monitorado via polling do banco de dados.
            </p>
            <p>
              <strong>Resiliente:</strong> Se o navegador fechar, a geração continua. 
              Chunks travados são resetados automaticamente ao retomar.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
