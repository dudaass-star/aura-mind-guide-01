import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, RefreshCw, Pencil, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Template {
  id: string;
  category: string;
  template_name: string;
  twilio_content_sid: string;
  prefix: string;
  meta_category: string;
  is_active: boolean;
}

export default function AdminTemplates() {
  const { isLoading: authLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading) redirectIfNotAdmin();
  }, [authLoading, isAdmin]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .order('category');

    if (error) {
      toast({ title: 'Erro ao carregar templates', description: error.message, variant: 'destructive' });
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (isAdmin) fetchTemplates();
  }, [isAdmin, fetchTemplates]);

  const updateTemplate = async (id: string, updates: { twilio_content_sid?: string; is_active?: boolean }) => {
    setUpdating(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const res = await supabase.functions.invoke('admin-update-template', {
        body: { id, updates },
      });

      if (res.error) throw new Error(res.error.message);

      setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
      toast({ title: 'Template atualizado' });
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar', description: err.message, variant: 'destructive' });
    } finally {
      setUpdating(null);
      setEditingId(null);
    }
  };

  const startEdit = (template: Template) => {
    setEditingId(template.id);
    setEditValue(template.twilio_content_sid);
  };

  const saveEdit = (id: string) => {
    if (editValue.trim()) {
      updateTemplate(id, { twilio_content_sid: editValue.trim() });
    }
  };

  if (authLoading || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/configuracoes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">WhatsApp Templates</h1>
          <Button variant="outline" size="sm" onClick={fetchTemplates} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Templates Twilio</CardTitle>
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
                    <TableHead>Categoria</TableHead>
                    <TableHead>Template Name</TableHead>
                    <TableHead>Content SID</TableHead>
                    <TableHead>Meta Category</TableHead>
                    <TableHead>Ativo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.category}</TableCell>
                      <TableCell className="text-muted-foreground">{t.template_name}</TableCell>
                      <TableCell>
                        {editingId === t.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEdit(t.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="h-8 w-64 font-mono text-xs"
                              autoFocus
                            />
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(t.id)} disabled={updating === t.id}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 cursor-pointer group" onClick={() => startEdit(t)}>
                            {t.twilio_content_sid === 'PENDING_APPROVAL' ? (
                              <Badge variant="destructive" className="font-mono text-xs">PENDING</Badge>
                            ) : (
                              <span className="font-mono text-xs text-muted-foreground">{t.twilio_content_sid}</span>
                            )}
                            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.meta_category === 'marketing' ? 'secondary' : 'outline'}>
                          {t.meta_category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={t.is_active}
                          disabled={updating === t.id}
                          onCheckedChange={(checked) => updateTemplate(t.id, { is_active: checked })}
                        />
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
