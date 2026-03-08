import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Brain } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AI_MODELS = [
  { value: 'google/gemini-2.5-pro', label: 'Google Gemini 2.5 Pro', description: 'Default — melhor custo-benefício via Gateway' },
  { value: 'google/gemini-2.5-flash', label: 'Google Gemini 2.5 Flash', description: 'Mais rápido e barato, menos preciso' },
  { value: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'API Anthropic direta — maior custo' },
  { value: 'openai/gpt-5', label: 'OpenAI GPT-5', description: 'Potente, custo mais alto via Gateway' },
];

export default function AdminSettings() {
  const { isLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const [selectedModel, setSelectedModel] = useState('google/gemini-2.5-pro');
  const [currentModel, setCurrentModel] = useState('google/gemini-2.5-pro');
  const [saving, setSaving] = useState(false);
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
        .select('value')
        .eq('key', 'ai_model')
        .single();

      if (error) throw error;
      const model = typeof data.value === 'string' ? data.value : JSON.stringify(data.value).replace(/"/g, '');
      setSelectedModel(model);
      setCurrentModel(model);
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

  if (isLoading || loadingConfig) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  const hasChanges = selectedModel !== currentModel;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/meditacoes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        </div>

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
                <SelectValue />
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
                Modelo ativo: <span className="font-medium text-foreground">{AI_MODELS.find(m => m.value === currentModel)?.label}</span>
              </p>
              <Button onClick={handleSave} disabled={saving || !hasChanges} variant="sage">
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
