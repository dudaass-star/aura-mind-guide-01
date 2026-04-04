import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, RefreshCw, Mail, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface TemplatePreview {
  templateName: string;
  displayName: string;
  subject: string;
  html: string;
  status: 'ready' | 'preview_data_required' | 'render_failed';
  errorMessage?: string;
}

export default function AdminEmails() {
  const { isLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const [templates, setTemplates] = useState<TemplatePreview[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    redirectIfNotAdmin();
  }, [isLoading, isAdmin]);

  useEffect(() => {
    if (isAdmin) loadTemplates();
  }, [isAdmin]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-preview-emails');
      if (error) throw error;
      const list = data?.templates || [];
      setTemplates(list);
      if (list.length > 0 && !selected) {
        setSelected(list[0].templateName);
      }
    } catch (e: any) {
      toast({ title: 'Erro ao carregar templates', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  const selectedTemplate = templates.find(t => t.templateName === selected);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/configuracoes')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Mail className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Templates de E-mail</h1>
          </div>
          <Button variant="outline" size="sm" onClick={loadTemplates} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        {loading && templates.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum template de e-mail encontrado.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
            {/* Template list */}
            <div className="space-y-2">
              {templates.map((t) => (
                <button
                  key={t.templateName}
                  onClick={() => setSelected(t.templateName)}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 transition-colors",
                    selected === t.templateName
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {t.status === 'ready' ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    ) : t.status === 'render_failed' ? (
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{t.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {t.status === 'ready' ? t.subject : t.status === 'render_failed' ? 'Erro ao renderizar' : 'Preview data necessário'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Preview area */}
            <Card className="overflow-hidden">
              {selectedTemplate ? (
                <>
                  <div className="border-b px-4 py-3 bg-muted/30">
                    <p className="text-sm font-medium text-foreground">{selectedTemplate.displayName}</p>
                    {selectedTemplate.subject && (
                      <p className="text-xs text-muted-foreground mt-0.5">Assunto: {selectedTemplate.subject}</p>
                    )}
                  </div>
                  <CardContent className="p-0">
                    {selectedTemplate.status === 'ready' ? (
                      <iframe
                        srcDoc={selectedTemplate.html}
                        sandbox="allow-same-origin"
                        className="w-full border-0"
                        style={{ minHeight: '600px' }}
                        title={`Preview: ${selectedTemplate.displayName}`}
                      />
                    ) : selectedTemplate.status === 'render_failed' ? (
                      <div className="p-6 text-center">
                        <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-3" />
                        <p className="text-sm text-destructive font-medium">Erro ao renderizar template</p>
                        {selectedTemplate.errorMessage && (
                          <p className="text-xs text-muted-foreground mt-2 font-mono bg-muted p-2 rounded">
                            {selectedTemplate.errorMessage}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="p-6 text-center">
                        <AlertCircle className="h-8 w-8 text-yellow-500 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">
                          Este template precisa de <code className="text-xs bg-muted px-1 py-0.5 rounded">previewData</code> para ser renderizado.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </>
              ) : (
                <CardContent className="py-20 text-center text-muted-foreground">
                  Selecione um template para visualizar
                </CardContent>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
