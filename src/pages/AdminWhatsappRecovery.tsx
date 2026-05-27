import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare } from 'lucide-react';

import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import RecoveryInbox from '@/components/admin/RecoveryInbox';
import { useEffect } from 'react';

/**
 * Página legada — agora redireciona visualmente para o painel unificado
 * em /admin/mensagens?tab=recuperacao. Mantida para não quebrar bookmarks.
 */
export default function AdminWhatsappRecovery() {
  const { isLoading: authLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => { redirectIfNotAdmin(); }, [authLoading, isAdmin]);

  if (authLoading || !isAdmin) {
    return <div className="p-8"><Skeleton className="h-8 w-64" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="container mx-auto p-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/engajamento')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Inbox WhatsApp · Recuperação</h1>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => navigate('/admin/mensagens?tab=recuperacao')}
          >
            Abrir no painel unificado
          </Button>
        </div>
      </header>

      <div className="container mx-auto p-4">
        <RecoveryInbox heightClass="h-[calc(100vh-150px)]" />
      </div>
    </div>
  );
}