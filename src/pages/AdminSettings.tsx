import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Brain, Mic } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AI_MODELS = [
  { value: 'google/gemini-2.5-pro', label: 'Google Gemini 2.5 Pro', description: 'Default — melhor custo-benefício via Gateway' },
  { value: 'google/gemini-2.5-flash', label: 'Google Gemini 2.5 Flash', description: 'Mais rápido e barato, menos preciso' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash', description: 'Nova geração — padrão, sem thinking extra' },
  { value: 'google/gemini-3-flash-preview:low', label: 'Gemini 3 Flash (Low)', description: 'Thinking mínimo — mais rápido' },
  { value: 'google/gemini-3-flash-preview:medium', label: 'Gemini 3 Flash (Medium)', description: 'Thinking moderado — equilíbrio' },
  { value: 'google/gemini-3-flash-preview:high', label: 'Gemini 3 Flash (High)', description: 'Thinking máximo — mais preciso' },
  { value: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'API Anthropic direta — maior custo' },
  { value: 'openai/gpt-5', label: 'OpenAI GPT-5', description: 'Potente, custo mais alto via Gateway' },
];

const TTS_MODELS = [
  { value: 'google/erinome', label: 'Google Erinome', description: 'Voz Erinome via Google Cloud TTS (atual)' },
  { value: 'inworld/aura', label: 'Inworld Aura', description: 'Voz customizada criada no Inworld' },
];

export default function AdminSettings() {
  const { isLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const [selectedModel, setSelectedModel] = useState('google/gemini-2.5-pro');
  const [currentModel, setCurrentModel] = useState('google/gemini-2.5-pro');
  const [selectedTTSModel, setSelectedTTSModel] = useState('google/erinome');
  const [currentTTSModel, setCurrentTTSModel] = useState('google/erinome');
  const [saving, setSaving] = useState(false);
  const [savingTTS, setSavingTTS] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    redirectIfNotAdmin();
  }, [isLoading, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    loadConfig();
  }, [isAdmin]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('system_config')
        .select('key, value')
        .in('key', ['ai_model', 'tts_model']);

      if (error) throw error;

      for (const row of data || []) {
        let val: string;
        try {
          val = typeof row.value === 'string' ? JSON.parse(row.value) : String(row.value);
        } catch {
          val = String(row.value).replace(/"/g, '');
        }
        if (row.key === 'ai_model') {
          setSelectedModel(val);
          setCurrentModel(val);
        } else if (row.key === 'tts_model') {
          setSelectedTTSModel(val);
          setCurrentTTSModel(val);
        }
      }
    } catch (e) {
      console.error('Error loading config:', e);
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('system_config')
        .upsert({ key: 'ai_model', value: JSON.stringify(selectedModel), updated_at: new Date().toISOString() }, { onConflict: 'key' });

      if (error) throw error;

      setCurrentModel(selectedModel);
      toast({ title: 'Configuração salva', description: `Modelo alterado para ${AI_MODELS.find(m => m.value === selectedModel)?.label}` });
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTTS = async () => {
    setSavingTTS(true);
    try {
      const { error } = await supabase
        .from('system_config')
        .upsert({ key: 'tts_model', value: JSON.stringify(selectedTTSModel), updated_at: new Date().toISOString() }, { onConflict: 'key' });

      if (error) throw error;

      setCurrentTTSModel(selectedTTSModel);
      toast({ title: 'Configuração salva', description: `Modelo de áudio alterado para ${TTS_MODELS.find(m => m.value === selectedTTSModel)?.label}` });
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSavingTTS(false);
    }
  };

  if (isLoading || loadingConfig) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  const hasChanges = selectedModel !== currentModel;
  const hasTTSChanges = selectedTTSModel !== currentTTSModel;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/meditacoes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                <CardTitle>Modelo de IA</CardTitle>
              </div>
              <CardDescription>
                Selecione o modelo usado pela Aura nas conversas principais. Modelos auxiliares (resumo, onboarding) sempre usam Gemini Flash.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um modelo" />
                </SelectTrigger>
                <SelectContent>
                  {AI_MODELS.map(model => (
                    <SelectItem key={model.value} value={model.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{model.label}</span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">
                  Modelo ativo: <span className="font-medium text-foreground">{AI_MODELS.find(m => m.value === currentModel)?.label || currentModel}</span>
                </p>
                <Button onClick={handleSave} disabled={saving || !hasChanges} variant="sage">
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Mic className="h-5 w-5 text-primary" />
                <CardTitle>Modelo de Áudio</CardTitle>
              </div>
              <CardDescription>
                Selecione o provedor de voz usado pela Aura para gerar áudios. Se falhar, o texto é enviado no lugar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedTTSModel} onValueChange={setSelectedTTSModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um modelo" />
                </SelectTrigger>
                <SelectContent>
                  {TTS_MODELS.map(model => (
                    <SelectItem key={model.value} value={model.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{model.label}</span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">
                  Modelo ativo: <span className="font-medium text-foreground">{TTS_MODELS.find(m => m.value === currentTTSModel)?.label || currentTTSModel}</span>
                </p>
                <Button onClick={handleSaveTTS} disabled={savingTTS || !hasTTSChanges} variant="sage">
                  <Save className="h-4 w-4 mr-2" />
                  {savingTTS ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
