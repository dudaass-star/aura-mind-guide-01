# Marina — demonstração para creators e lojas

Revisão: 27 de novembro de 2026. Toda a história foi escrita como ficção demonstrativa. Não é prontuário, cliente real, resultado clínico ou depoimento pessoal de creator.

## Personagem e continuidade

Marina tem 33 anos, trabalha com projetos e gosta do trabalho, da relação com a irmã e de escrever. No início, responde às demandas antes de considerar o próprio tempo. A evolução não é deixar de cuidar dos outros: é participar das próprias escolhas, negociar prioridades e voltar à escrita.

Ela continua sentindo receio e culpa em algumas situações. Tem semanas difíceis, corrige uma leitura da AURA e volta a conversar sobre uma combinação que não funcionou. Não há cura, transformação instantânea, diagnóstico ou histórico de trauma/divórcio inventado.

## Os seis encontros

Todos às 19h de Brasília, com 45 minutos e participação da Marina do início ao fechamento. O Essencial mantém dois encontros por mês.

| Data | Tema | Continuidade |
| --- | --- | --- |
| 13/09 | Ter lugar na própria rotina | Distinguir escolha de medo antes de responder |
| 27/09 | Dizer não sem deixar de cuidar | Reservar a oficina e oferecer ajuda em outro horário |
| 11/10 | Uma semana difícil não apaga o caminho | Reconhecer um aceite excessivo e negociar prioridades |
| 25/10 | Escrever sem precisar provar talento | Aprender sem transformar cada texto em avaliação pessoal |
| 08/11 | Cuidar sem decidir pelo outro | Escutar a irmã sem assumir a solução |
| 22/11 | Escolher com mais honestidade | Reconhecer mudança mesmo quando a culpa reaparece |

Há 138 mensagens, incluindo conversas entre os encontros. A conversa mais recente, de 27/11, mostra Marina mantendo a oficina, combinando outro horário com a irmã e escolhendo compartilhar um texto ainda imperfeito. Termina naturalmente quando ela sai para jantar com uma amiga, sem pergunta abandonada ou nova sessão repetida.

Próximo encontro: 06/12 às 19h, confirmado pelo fluxo do App, com preparação guardada e confirmada após recarregar. Não foi iniciado para preparar a demonstração.

## O que está disponível no Percurso

- Evolução de setembro a novembro com evidências nas falas da personagem.
- Dois capítulos fechados, setembro e outubro, com cartas da AURA.
- Três reflexões guardadas pelo próprio fluxo do App, vinculadas aos fechamentos dos encontros de 27/09, 25/10 e 22/11.
- Três temas atuais: escolhas e limites; escrita e tempo próprio; relação com a irmã.
- Quatro viradas concretas, sem repetir o mesmo acontecimento como várias conquistas.
- Três leituras semanais e dois registros mensais, consistentes com conversas e encontros.
- Retrato Sobre você e memória interna reconstruídos com a mesma história.
- Quatro mensagens com a voz oficial da AURA, em arquivos privados com acesso renovável e duração medida.

## Revisão e gravação

1. Na conversa, conferir a troca recente e tocar um áudio; também abrir “Ler mensagem”.
2. No Percurso, mostrar o Antes/Agora e as três reflexões guardadas.
3. Abrir os capítulos de setembro e outubro; mostrar acontecimentos, carta e continuidade.
4. Em Sessões, avançar para dezembro para mostrar o próximo encontro e sua preparação; os seis anteriores continuam na lista de concluídos.
5. Em Explorar → Sobre você, conferir o retrato da personagem.

Os creators devem apresentar essas telas como demonstração da experiência. Não podem atribuir a si mesmos as falas, a evolução ou os acontecimentos da Marina como resultados pessoais. A conta continua identificada como fictícia e não tem telefone ou cobrança. O acesso permanece pelos convites individuais protegidos existentes.

Novas conversas e sessões reais feitas por creators nessa conta compartilhada podem alterar a história. Esta revisão não introduz bloqueio, cópias por creator ou restauração automática; avaliar novamente a conta antes de cada nova captação.

## Verificação

- Referência estrutural sem textos de cliente ou credenciais em `tests/fixtures/demo-marina.json`.
- Testes em `tests/demo-marina.test.ts`: isolamento, participação, 45 minutos, limite mensal, cronologia, vínculo das respostas, evidências, reflexões e preparação de áudio.
- Dez testes passaram. As 138 mensagens foram carregadas pela tela; leitura sem reprodução automática, reprodução individual e pausa, capítulos, calendário, preparação após recarga, retrato e versão de computador foram conferidos na conta autenticada.
- A revisão encontrou um problema de interpretação das datas das cartas: o primeiro dia do mês criava um capítulo no mês anterior em Brasília. A correção foi feita na origem da leitura de datas e validada na prévia, com exatamente dois capítulos. Essa correção de código ainda precisa ser publicada; os dados da personagem já estão atualizados na conta compartilhada.

Nenhuma mudança de design, publicação de vitrine ou envio às lojas foi feito nesta tarefa.