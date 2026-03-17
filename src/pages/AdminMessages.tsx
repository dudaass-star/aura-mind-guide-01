import { useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, MessageSquare, Search, Send, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface UserWithMessages {
  user_id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
  plan: string | null;
  trial_conversations_count: number;
  last_message: { content: string; role: string; created_at: string } | null;
  message_count: number;
}

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export default function AdminMessages() {
  const { isLoading: authLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [users, setUsers] = useState<UserWithMessages[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserWithMessages[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserWithMessages | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [newMessage, setNewMessage] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    redirectIfNotAdmin();
  }, [authLoading, isAdmin]);

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  useEffect(() => {
    const q = searchQuery.toLowerCase();
    setFilteredUsers(
      users.filter(u =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.phone || '').includes(q)
      )
    );
  }, [searchQuery, users]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('admin-messages', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: null,
        method: 'GET',
      });

      // supabase.functions.invoke sends POST by default, use fetch instead
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-messages?action=list`,
        {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao carregar usuários', variant: 'destructive' });
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchConversation = async (userId: string) => {
    setLoadingMessages(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-messages?action=conversation&user_id=${userId}`,
        {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch conversation');
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao carregar conversa', variant: 'destructive' });
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSelectUser = (user: UserWithMessages) => {
    setSelectedUser(user);
    fetchConversation(user.user_id);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedUser) return;
    setSendingMessage(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-send-message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            phone: selectedUser.phone,
            message: newMessage,
            user_id: selectedUser.user_id,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to send message');

      setNewMessage('');
      // Refresh conversation
      await fetchConversation(selectedUser.user_id);
      toast({ title: 'Mensagem enviada!' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao enviar mensagem', variant: 'destructive' });
    } finally {
      setSendingMessage(false);
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'trial': return 'bg-yellow-500';
      case 'cancelled': return 'bg-red-500';
      case 'paused': return 'bg-orange-500';
      default: return 'bg-muted-foreground';
    }
  };

  const truncateText = (text: string, maxLength: number) =>
    text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

  const isAutomatedMessage = (content: string): boolean => {
    const patterns = [
      'olaaura.com.br/checkout',
      'Nossa primeira jornada foi muito especial',
      'acabei de perceber que você não destravou',
      'Sua assinatura foi encerrada',
      'Sua conta está inativa',
      'Sua assinatura está pausada',
      'sei que a vida puxa a gente de volta',
      'Foi muito especial conversar',
      'Tô adorando te conhecer',
      'quando você quiser continuar',
      'por menos de R$1 por dia',
      'Sinto sua falta',
    ];
    const lower = content.toLowerCase();
    return patterns.some(p => lower.includes(p.toLowerCase()));
  };

  const formatMessageTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return format(date, 'HH:mm');
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return format(date, 'EEEE', { locale: ptBR });
    return format(date, 'dd/MM/yy');
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const showConversation = !isMobile || selectedUser;
  const showUserList = !isMobile || !selectedUser;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/engajamento')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <MessageSquare className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Mensagens</h1>
        {selectedUser && isMobile && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelectedUser(null)}>
            Voltar à lista
          </Button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* User List Panel */}
        {showUserList && (
          <div className={`${isMobile ? 'w-full' : 'w-[380px]'} border-r border-border flex flex-col bg-card`}>
            {/* Search */}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou telefone..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Users */}
            <ScrollArea className="flex-1">
              {loadingUsers ? (
                <div className="p-4 space-y-3">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  {filteredUsers.map(user => (
                    <button
                      key={user.user_id}
                      onClick={() => handleSelectUser(user)}
                      className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left border-b border-border/50 ${
                        selectedUser?.user_id === user.user_id ? 'bg-accent' : ''
                      }`}
                    >
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${getStatusColor(user.status)}`} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm text-foreground truncate">
                            {user.name || user.phone || 'Sem nome'}
                          </span>
                          {user.last_message && (
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {formatMessageTime(user.last_message.created_at)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground truncate">
                            {user.last_message
                              ? `${user.last_message.role === 'assistant' ? '🤖 ' : ''}${truncateText(user.last_message.content, 45)}`
                              : 'Sem mensagens'}
                          </span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                            {user.message_count}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {user.plan || 'trial'}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            trial: {user.trial_conversations_count}/50
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                  {filteredUsers.length === 0 && !loadingUsers && (
                    <p className="text-center text-muted-foreground py-8 text-sm">
                      Nenhum usuário encontrado
                    </p>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* Conversation Panel */}
        {showConversation && (
          <div className="flex-1 flex flex-col bg-background">
            {selectedUser ? (
              <>
                {/* Conversation Header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-foreground">
                      {selectedUser.name || 'Sem nome'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedUser.phone} · {selectedUser.status} · {selectedUser.plan || 'trial'}
                    </p>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  {loadingMessages ? (
                    <div className="space-y-3">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                          <Skeleton className="h-12 w-64 rounded-xl" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {messages.map(msg => {
                        const isAutoMessage = msg.role === 'assistant' && isAutomatedMessage(msg.content);
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                                msg.role === 'user'
                                  ? 'bg-primary text-primary-foreground rounded-br-md'
                                  : isAutoMessage
                                    ? 'bg-orange-100 dark:bg-orange-900/30 text-foreground rounded-bl-md border border-orange-200 dark:border-orange-800'
                                    : 'bg-muted text-foreground rounded-bl-md'
                              }`}
                            >
                              {isAutoMessage && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 mb-1 border-orange-300 text-orange-600 dark:text-orange-400">
                                  🤖 auto
                                </Badge>
                              )}
                              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                              <p className={`text-[10px] mt-1 ${
                                msg.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                              }`}>
                                {format(new Date(msg.created_at), 'dd/MM HH:mm')}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                {/* Send Message */}
                <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-card">
                  <Input
                    placeholder="Enviar mensagem via WhatsApp..."
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                    disabled={sendingMessage}
                    className="flex-1"
                  />
                  <Button
                    size="icon"
                    onClick={handleSendMessage}
                    disabled={sendingMessage || !newMessage.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Selecione um usuário para ver a conversa</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
