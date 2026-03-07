

## Onde e como destacar a Cápsula do Tempo

### Análise

A Cápsula do Tempo é uma feature de **retenção** (lock-in psicológico), não de **aquisição**. Ela gera valor emocional para quem já usa a AURA. Isso muda onde e como destacá-la:

- **No site (landing page)**: Sim, mas como **diferencial/benefício**, não como seção inteira. O objetivo é despertar curiosidade, não explicar o fluxo técnico.
- **No guia do usuário**: Sim, como **seção dedicada** entre Meditações e Dicas — é onde o usuário ativo vai entender como funciona.

### Mudanças propostas

#### 1. Landing page — Seção Benefits (`Benefits.tsx`)
Adicionar um novo card na grade de benefícios existente:
- Icone: `Timer` ou `Gift`
- Título: "Cápsula do Tempo"
- Descrição: "Grave uma mensagem pro seu eu do futuro. A AURA guarda e entrega de surpresa daqui a 3 meses."

Isso mantém o padrão visual e não cria uma seção nova desnecessária. É uma menção que gera curiosidade.

#### 2. Guia do Usuário (`UserGuide.tsx`)
Adicionar uma nova seção `id="capsula"` entre Meditações e Dicas, com:
- Titulo: "Cápsula do Tempo"
- Subtítulo: "Uma mensagem para o seu eu do futuro"
- Explicação simples do fluxo (a AURA propõe → você grava um áudio → confirma → recebe de surpresa em 3 meses)
- 3 cards: "Grave quando quiser", "Regrave quantas vezes precisar", "Receba de surpresa"
- Nota emocional sobre o impacto de se ouvir meses depois

#### 3. FAQ (`FAQ.tsx`)
Adicionar uma pergunta: "O que é a Cápsula do Tempo?" com resposta curta explicando o conceito.

### Resumo
| Local | Tipo de destaque | Objetivo |
|-------|-----------------|----------|
| Benefits (landing) | Card na grade | Curiosidade / diferencial |
| UserGuide | Seção dedicada | Educação do usuário ativo |
| FAQ | Pergunta | Tirar dúvida comum |

