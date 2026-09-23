# Agenda mensal flexível de sessões

## Resultado

O cliente poderá agendar uma, algumas ou todas as sessões disponíveis no mês, sem obrigação de preencher a agenda inteira. Cada sessão futura terá seus próprios controles e lembretes.

Quando a cota mensal estiver completa, a ação de novo agendamento será substituída por um convite discreto para conhecer um plano com mais sessões.

## O que será alterado

- Permitir várias sessões futuras, respeitando a cota do plano no mês em que cada encontro acontecerá.
- Exibir todas as próximas sessões em ordem, com reagendamento e cancelamento individuais.
- Manter o contador mensal e permitir novos agendamentos enquanto houver vagas.
- Ao esgotar a cota, mostrar “Quero mais sessões” e abrir a troca de plano já existente.
- Destacar apenas planos com mais sessões que o plano atual, sem mostrar oferta antes do limite.
- Preservar lembretes de 24 horas e 5 minutos para cada sessão e reiniciá-los apenas na sessão reagendada.
- Manter bloqueio de horários conflitantes, segurança contra toque duplo e proteção das cotas.

## Regras

- Essencial, Lite e Taster: até 1 sessão por mês.
- Direção: até 4 sessões por mês.
- Transformação: até 8 sessões por mês.
- Sessões canceladas devolvem a vaga.
- Sessões concluídas ou não comparecidas continuam consumindo a cota do mês.
- A cota é calculada pelo mês do horário agendado, em Brasília.
- O cliente pode organizar meses futuros separadamente, sem consumir a cota do mês atual.

## Validação

- Simular agendamentos sequenciais e simultâneos até cada limite.
- Confirmar bloqueio da tentativa acima da cota.
- Testar reagendamento entre meses, cancelamento e devolução da vaga.
- Confirmar lembretes independentes e ausência de colisões entre sessões.
- Validar a tela no celular com listas de 1, 4 e 8 sessões.
- Confirmar que o convite de upgrade aparece somente quando o mês escolhido estiver completo.

## Detalhes técnicos

- Remover a trava global de “uma sessão futura” e manter a serialização por cliente para evitar ultrapassar a cota em concorrência.
- Ajustar a função segura de agenda para tratar cada sessão pelo identificador próprio.
- Manter o bloqueio de proximidade entre horários e as restrições de escrita direta.
- Adaptar a área de sessões para uma coleção de próximas sessões e passar a sessão selecionada às ações de edição.
- Reaproveitar a janela atual de troca de plano, com filtro de planos superiores quando aberta pela agenda.