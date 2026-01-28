

# Plano: Adicionar Download e Upload de Áudio na Página de Meditações

## Objetivo
Adicionar dois novos botões na página de administração de meditações:
1. **Download** - Baixar o arquivo de áudio MP3 existente
2. **Upload** - Substituir o áudio por outro arquivo enviado manualmente

---

## Mudanças na Interface

### Coluna de Ações (onde está o botão Play)
Adicionar dois novos botões ao lado do botão de reprodução:

```text
┌─────────────────────────────────────────────────────────────┐
│  Ações                                                      │
├─────────────────────────────────────────────────────────────┤
│  [▶ Play]  [⬇ Download]  [⬆ Upload]  [🔄 Gerar/Regenerar]  │
└─────────────────────────────────────────────────────────────┘
```

- **Download**: Visível apenas quando existe áudio
- **Upload**: Sempre visível para qualquer meditação (permite substituir ou adicionar)

---

## Implementação

### 1. Botão de Download
- Usar o atributo `download` do HTML para forçar download do arquivo
- O nome do arquivo será baseado no título da meditação (ex: `meditacao-respiracao-profunda.mp3`)
- Como o áudio já tem uma URL pública, basta criar um link com `download`

### 2. Botão de Upload
- Adicionar um input de arquivo oculto (`type="file"`)
- Aceitar apenas arquivos de áudio (`.mp3, .m4a, .wav`)
- Ao selecionar arquivo:
  1. Fazer upload para o Storage no caminho `{meditation_id}/audio.mp3`
  2. Atualizar o registro na tabela `meditation_audios` com a nova URL
  3. Mostrar feedback de sucesso

---

## Detalhes Técnicos

### Componentes a modificar
- **src/pages/AdminMeditations.tsx**

### Novas dependências
Usar ícones do Lucide que já estão disponíveis:
- `Download` - ícone de download
- `Upload` - ícone de upload

### Lógica de Upload
```text
1. Usuário clica no botão "Upload"
2. Input file abre seletor de arquivos
3. Arquivo selecionado é validado (tipo e tamanho)
4. Upload para Supabase Storage: meditations/{meditation_id}/audio.mp3
5. Atualizar/inserir registro em meditation_audios
6. Atualizar lista de meditações
```

### Tratamento de erros
- Validar tamanho máximo (ex: 50MB)
- Validar tipo de arquivo (apenas áudio)
- Mostrar toast de erro se upload falhar

---

## Resultado Final
O usuário poderá:
- Baixar qualquer áudio gerado diretamente do navegador
- Substituir um áudio gerado por uma versão editada manualmente
- Adicionar áudio manualmente para meditações que ainda não têm

