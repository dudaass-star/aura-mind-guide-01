---
name: KB e postura de fechamento do recovery-agent
description: recovery_knowledge_base com categorias sempre injetadas (inclui duvida_tecnica e objecao) e system_prompt de closer por diagnóstico de trava
type: feature
---
`ALWAYS_CATEGORIES` em `supabase/functions/recovery-agent/index.ts`: preco, garantia, como_funciona, pagamento, seguranca, beneficio, **duvida_tecnica**, **objecao**. `MAX_KB_ITEMS = 40` (todas as always cabem; keyword match complementa).

- `duvida_tecnica` (10 itens): PIX Automático na tela do banco, por que o banco pede autorização, quando/quanto debita (8º dia), extrato, banco recusou, revogar mandato, trocar plano/ciclo, como o acesso chega no WhatsApp, por que CPF/telefone, semana promocional só na 1ª assinatura.
- `objecao` (7 itens): "vou pensar", caro, IA não vai me entender, já tentei terapia/app, medo de cobrança escondida, não confio em link, sem tempo.
- Fatos vigentes na KB: trial semanal **nos dois meios** (cartão e PIX Automático), só mensal e só cliente novo — 6,90/9,90/19,90; mensal 29,90/49,90/79,90; ciclos longos por mês (Ess 19,90/14,90/9,90 · Dir 33,90/24,90/16,90 · Transf 53,90/39,90/26,90). Itens antigos de "PIX não tem trial" foram corrigidos (não existem mais).

`recovery_agent_config.system_prompt` (id=1) opera como closer: diagnostica a trava (detalhe técnico / desconfiança / preço / insegurança / recusa), resolve UMA por mensagem, estrutura resposta → ponte ligada à fala do lead → link ou UMA pergunta de fechamento; sem upsell, sem reabrir plano escolhido, sem repetir argumento (troca por pergunta de fechamento). Escalar = email suporte@olaaura.com.br, nunca "humano no WhatsApp".

**Duas camadas obrigatórias (ago/2026)**: toda resposta destrava a dúvida **e** mostra UM diferencial concreto do bloco `O QUE ELA GANHA` — meditação guiada em áudio, jornada com episódio semanal, encontro guiado 45min, memória longa, áudio, 3h da manhã, portal /meu-espaco. O bloco vem de `VALUE_SHOWCASE` + `renderValueShowcase(historyTxt)` em `recovery-agent/index.ts`, que marca `[JÁ CITADO]` os diferenciais que já apareceram no histórico (anti-repetição). Regra explícita no prompt: mostrar o que já está incluído no plano escolhido **não** é upsell (upsell = plano/ciclo mais caro); 1ª semana é enquadrada como experiência completa, não como desconto; falar em cena ("3h da manhã você manda áudio"), nunca em lista de features. Motivo: os transcritos de ago/26 mostravam respostas corretas mas secas, sem nenhuma menção a meditações/jornadas — o admin precisava entrar manualmente pra pitchar.
