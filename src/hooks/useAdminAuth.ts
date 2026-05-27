import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface AdminAuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  userId: string | null;
}

export function useAdminAuth() {
  const [state, setState] = useState<AdminAuthState>({
    isLoading: true,
    isAuthenticated: false,
    isAdmin: false,
    userId: null,
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        // Se o usuário acabou de iniciar um login Google pelo /meu-espaco,
        // a sessão do broker cai temporariamente no cliente padrão.
        // Nesse caso, NÃO tratamos como admin: limpamos local e aguardamos
        // o PortalAuthContext migrar a sessão para o cliente do portal.
        let oauthTarget: string | null = null;
        try { oauthTarget = sessionStorage.getItem("aura-oauth-target"); } catch {}
        if (oauthTarget === "portal") {
          try { await supabase.auth.signOut({ scope: "local" }); } catch {}
          setState({
            isLoading: false,
            isAuthenticated: false,
            isAdmin: false,
            userId: null,
          });
          return;
        }

        // Check if user is authenticated
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          setState({
            isLoading: false,
            isAuthenticated: false,
            isAdmin: false,
            userId: null,
          });
          return;
        }

        // Check if user has admin role using the has_role function
        const { data: isAdmin, error: roleError } = await supabase
          .rpc('has_role', { _user_id: user.id, _role: 'admin' });

        if (roleError) {
          console.error('Error checking admin role:', roleError);
          setState({
            isLoading: false,
            isAuthenticated: true,
            isAdmin: false,
            userId: user.id,
          });
          return;
        }

        setState({
          isLoading: false,
          isAuthenticated: true,
          isAdmin: isAdmin || false,
          userId: user.id,
        });

      } catch (error) {
        console.error('Error in admin auth check:', error);
        setState({
          isLoading: false,
          isAuthenticated: false,
          isAdmin: false,
          userId: null,
        });
      }
    };

    checkAdminStatus();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAdminStatus();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const redirectIfNotAdmin = () => {
    if (!state.isLoading && !state.isAuthenticated) {
      navigate('/admin/login');
      return;
    }
    if (!state.isLoading && !state.isAdmin) {
      toast({
        title: "Acesso negado",
        description: "Você não tem permissão para acessar esta página.",
        variant: "destructive",
      });
      navigate('/');
    }
  };

  return { ...state, redirectIfNotAdmin };
}
