

## Adicionar botão "Notificar Reconexão" no painel de instâncias

### Alteração

**`src/pages/AdminInstances.tsx`**

- Adicionar coluna "Ações" na tabela de instâncias
- Em cada linha, renderizar um botão "Notificar" que chama `supabase.functions.invoke('instance-reconnect-notify', { body: { instance_id } })`
- Mostrar estado de loading individual por instância (usando um `Set<string>` de IDs em envio)
- Exibir toast com resultado (enviados/erros)
- Ícone: `MessageSquare` do lucide-react

### UX

- Botão pequeno com ícone + texto "Notificar"
- Desabilitado durante envio (spinner)
- Toast de sucesso mostra quantidade enviada
- Toast de erro mostra mensagem

