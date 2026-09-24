---
name: Escala operacional do aplicativo
description: O aplicativo e suas rotinas devem suportar crescimento com lotes, retomada segura, idempotência e validação de carga.
type: constraint
---
Toda funcionalidade recorrente do Olá Aura deve ser estruturada para escala, sem depender de uma única execução longa ou de processamento sequencial por cliente. Usar lotes limitados, retomada após falha, proteção contra concorrência e duplicidade, métricas operacionais e simulações de carga antes de considerar o fluxo concluído.