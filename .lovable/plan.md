
# Plano: Scripts de Meditacao Expandidos (Sem Background)

## Objetivo

Reescrever os 6 scripts de meditacao para atingir as duracoes planejadas (5-10 minutos), sem musica de fundo por enquanto.

---

## Analise de Tamanho Necessario

Com `speakingRate: 0.90` e voz Erinome, aproximadamente **700-800 caracteres = 1 minuto** de audio.

| Meditacao | Duracao Alvo | Caracteres Necessarios |
|-----------|--------------|------------------------|
| Respiracao 4-7-8 | 5 min | ~4.000 chars |
| Ansiedade (Tempestade) | 7 min | ~5.500 chars |
| Sono (Relaxamento) | 10 min | ~8.000 chars |
| Estresse (Muscular) | 8 min | ~6.500 chars |
| Foco (Clareza) | 5 min | ~4.000 chars |
| Gratidao (Olhar) | 5 min | ~4.000 chars |

---

## Estrutura dos Scripts Expandidos

### 1. Respiracao 4-7-8 (5 min - ~4.000 chars)

- Introducao acolhedora e preparacao (45s)
- Explicacao da tecnica 4-7-8 (30s)
- **8 ciclos completos** com contagem lenta detalhada (3 min)
- Momentos de silencio guiado entre ciclos
- Integracao e encerramento suave (45s)

### 2. Acalmando a Tempestade - Ansiedade (7 min - ~5.500 chars)

- Acolhimento emocional profundo (1 min)
- Exercicio 5-4-3-2-1 **muito detalhado** com pausas longas (3.5 min)
- Visualizacao expandida da tempestade se dissipando (1.5 min)
- Respiracao de ancoragem com varios ciclos (45s)
- Encerramento com afirmacoes de seguranca (15s)

### 3. Relaxamento para Dormir (10 min - ~8.000 chars)

- Preparacao para o sono, ambiente seguro (1 min)
- Body scan **completo e detalhado**: pes, tornozelos, panturrilhas, joelhos, coxas, quadris, abdomen, peito, maos, bracos, ombros, pescoco, rosto, cabeca (6 min)
- Visualizacao de lugar seguro e aconchegante (2 min)
- Contagem regressiva suave de 10 a 1 (45s)
- Transicao silenciosa para o sono (15s)

### 4. Relaxamento Muscular Progressivo (8 min - ~6.500 chars)

- Introducao e posicionamento corporal (45s)
- Tensao/relaxamento: maos e antebracos (1.5 min)
- Tensao/relaxamento: bracos e ombros (1.5 min)
- Tensao/relaxamento: rosto completo (1 min)
- Tensao/relaxamento: pescoco e nuca (45s)
- Tensao/relaxamento: tronco e abdomen (1 min)
- Tensao/relaxamento: pernas e pes (1 min)
- Integracao corporal completa (30s)

### 5. Clareza Mental - Foco (5 min - ~4.000 chars)

- Centralizacao, postura e intencao (45s)
- Metafora do ceu e nuvens **expandida** com detalhes visuais (1.5 min)
- Exercicio de foco na respiracao com multiplos ciclos (2 min)
- Definicao de intencao clara (30s)
- Abertura energizada para acao (15s)

### 6. Olhar de Gratidao (5 min - ~4.000 chars)

- Preparacao e conexao com o momento presente (30s)
- Gratidao pelo corpo - cada parte mencionada (1.5 min)
- Gratidao pelas pessoas - visualizacao de rostos (1.5 min)
- Gratidao pelas experiencias e aprendizados (1 min)
- Irradiacao de gratidao para o mundo (30s)

---

## Tecnicas de Expansao

1. **Pausas naturais**: Uso extensivo de "..." para criar silencio
2. **Contagem lenta**: "Inspire... um... dois... tres... quatro..."
3. **Repeticoes**: Mais ciclos de respiracao e relaxamento
4. **Descricoes sensoriais**: Cores, texturas, temperaturas, sensacoes
5. **Verificacoes**: "Perceba como seu corpo esta agora..."
6. **Transicoes suaves**: "Quando estiver pronto..." "Gentilmente..."

---

## Implementacao

### Passo 1: Escrever Scripts Expandidos
Criar os 6 scripts completos em portugues brasileiro, formatados para a voz Erinome com pausas naturais.

### Passo 2: Atualizar Banco de Dados
```sql
UPDATE meditations 
SET script = '[script expandido]'
WHERE id = 'med-respiracao-478';
-- (repetir para cada meditacao)
```

### Passo 3: Limpar Audios Antigos
```sql
DELETE FROM meditation_audios;
```

### Passo 4: Regenerar Audios
Chamar `batch-generate-meditations` para gerar os novos MP3s com a voz da AURA.

### Passo 5: Validar Duracoes
Verificar se os audios gerados estao proximos das duracoes planejadas.

---

## Resultado Esperado

| Meditacao | Duracao Final |
|-----------|---------------|
| Respiracao 4-7-8 | ~5 minutos |
| Ansiedade | ~7 minutos |
| Sono | ~10 minutos |
| Estresse | ~8 minutos |
| Foco | ~5 minutos |
| Gratidao | ~5 minutos |

**Total**: 6 meditacoes guiadas completas, com a voz personalizada da AURA, prontas para envio via WhatsApp.
