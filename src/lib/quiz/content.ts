// Conteúdo do quiz de aquisição (/quiz). Texto fixo e revisado por combinação;
// nada aqui é gerado por IA nem enviado à Meta.

export type ThemeId = "relacoes" | "limites" | "mente" | "sobrecarga";

export interface PatternOption {
  id: string;
  label: string;
  /** Nome curto do diagnóstico, em negrito no cartão. */
  head: string;
  /** Diagnóstico em uma frase (cartão "O que está acontecendo"). */
  short: string;
  /** Espelho da escolha, em 2ª pessoa, sem exagerar o comportamento. */
  mirror: string;
  /** Pergunta de abertura da AURA na prévia do 1º encontro. */
  opening: string;
}

export interface Theme {
  id: ThemeId;
  label: string;
  bridge: string;
  /** Nome curto do padrão mostrado na pílula do resultado. */
  patternName: string;
  title: string;
  insight: string;
  patterns: PatternOption[];
}

export const THEMES: Theme[] = [
  {
    id: "relacoes",
    label: "Parar de me anular para agradar os outros.",
    bridge: "Quando isso acontece com frequência, pode ser difícil pensar em outra coisa.",
    patternName: "Buscar paz no outro",
    title: "Você está tentando encontrar segurança em algo que não consegue controlar.",
    insight:
      "Talvez o mais desgastante não seja só o medo de perder alguém. É quanto espaço essa preocupação passou a ocupar no seu dia — e quão pouco sobra para perceber o que você mesma precisa.",
    patterns: [
      {
        id: "atenta",
        label: "Fico atenta a cada mudança de humor ou atitude da pessoa, e isso consome meu dia.",
        head: "Hipervigilância emocional.",
        short: "Você gasta tanta energia tentando prever o humor do outro que sobra quase nada para o que você mesma precisa.",
        mirror: "fica atenta a cada mudança de humor ou atitude da pessoa, e isso tem consumido seu dia",
        opening: "Quando você percebe alguma mudança no jeito dela, o que costuma passar pela sua cabeça naquele momento?",
      },
      {
        id: "cede",
        label: "Abro mão da minha paz e engulo o que penso só para evitar briga ou rejeição.",
        head: "Paz comprada com silêncio.",
        short: "Engolir o que pensa evita a briga na hora, mas vai te afastando de você mesma.",
        mirror: "costuma engolir o que pensa para evitar briga ou rejeição",
        opening: "Qual foi a última vez que você deixou de dizer algo para não criar atrito? O que você queria ter dito?",
      },
      {
        id: "cenarios",
        label: "Tenho dificuldade de confiar e acabo criando cenários ruins na cabeça.",
        head: "Mente em modo de defesa.",
        short: "A cabeça cria o pior cenário para tentar te proteger, e você sofre antes de qualquer coisa acontecer.",
        mirror: "tem dificuldade de confiar e acaba criando cenários ruins na cabeça",
        opening: "Quando um desses cenários aparece, o que costuma acontecer logo antes? Uma mensagem, um silêncio, um gesto?",
      },
      {
        id: "invisivel",
        label: "Me sinto sozinha ou invisível, mesmo quando a gente está junto.",
        head: "Solidão a dois.",
        short: "Estar junto não tem bastado. Falta se sentir vista de verdade por quem está do seu lado.",
        mirror: "se sente sozinha ou invisível, mesmo quando vocês estão juntos",
        opening: "Em que momentos essa sensação de estar sozinha aparece mais forte, mesmo com a pessoa do lado?",
      },
    ],
  },
  {
    id: "limites",
    label: "Conseguir dizer não sem engolir o que sinto.",
    bridge: "Nem sempre é fácil falar o que você precisa, principalmente quando está acostumada a ceder.",
    patternName: "Ficar sempre por último",
    title: "Você cuida de todo mundo com tanto cuidado que acaba ficando por último.",
    insight:
      "Ceder às vezes evita um desconforto na hora. Mas, quando vira regra, a conta chega depois — em cansaço, irritação ou na sensação de que ninguém percebe o que você faz.",
    patterns: [
      {
        id: "sim",
        label: "Digo \"sim\" quando queria dizer \"não\", e depois fico com raiva de mim mesma.",
        head: "O \"sim\" que custa caro.",
        short: "Cada \"sim\" que você não queria dar evita um desconforto e cobra depois, em raiva de si mesma.",
        mirror: "diz \"sim\" quando queria dizer \"não\" e depois fica com raiva de si mesma",
        opening: "Pensa no último \"sim\" que você se arrependeu de ter dado. O que você imaginou que aconteceria se dissesse \"não\"?",
      },
      {
        id: "culpa",
        label: "Quando tento me posicionar ou impor um limite, sinto uma culpa imediata.",
        head: "Culpa por se colocar.",
        short: "Você aprendeu que se posicionar é errado, então a culpa chega antes mesmo do limite.",
        mirror: "sente uma culpa imediata quando tenta se posicionar ou colocar um limite",
        opening: "Quando essa culpa aparece, que frase costuma vir junto na sua cabeça?",
      },
      {
        id: "espera",
        label: "Fico esperando que os outros percebam meu cansaço, e como ninguém nota, me fecho.",
        head: "Esperar ser percebida.",
        short: "Você torce para alguém notar seu cansaço e, quando ninguém nota, se fecha ainda mais.",
        mirror: "espera que os outros percebam seu cansaço e, quando ninguém nota, se fecha",
        opening: "Se alguém perguntasse hoje, de verdade, como você está — o que você responderia?",
      },
      {
        id: "ninguem",
        label: "Cuido de todo mundo, mas quase ninguém pergunta como eu realmente estou.",
        head: "Cuidado de mão única.",
        short: "Você cuida de todo mundo, mas quase ninguém devolve esse cuidado para você.",
        mirror: "cuida de todo mundo, mas quase ninguém pergunta como você realmente está",
        opening: "De todas as pessoas que você cuida, de qual delas você sente mais falta de receber o mesmo cuidado?",
      },
    ],
  },
  {
    id: "mente",
    label: "Desacelerar pensamentos e preocupações constantes.",
    bridge: "E muitas vezes esses pensamentos aparecem justamente quando você tenta descansar.",
    patternName: "Mente que não desliga",
    title: "Sua cabeça continua trabalhando mesmo quando o dia já acabou.",
    insight:
      "Pensar muito não é defeito. O difícil é quando os mesmos pensamentos voltam sem levar a lugar nenhum — e ocupam o tempo que deveria ser de descanso.",
    patterns: [
      {
        id: "noite",
        label: "Ao deitar na cama, a cabeça acelera repassando conversas, erros e cobranças.",
        head: "A noite que não desliga.",
        short: "Quando o corpo para, a cabeça começa a repassar conversas, erros e cobranças.",
        mirror: "deita na cama e a cabeça acelera repassando conversas, erros e cobranças",
        opening: "Qual conversa ou cobrança mais tem voltado à sua cabeça nessas noites?",
      },
      {
        id: "passado",
        label: "Fico presa em decisões antigas, pensando no que eu deveria ter feito diferente.",
        head: "Presa no que já foi.",
        short: "Você revive decisões antigas como se ainda desse para mudá-las, e isso rouba energia do agora.",
        mirror: "fica presa em decisões antigas, pensando no que deveria ter feito diferente",
        opening: "Qual decisão mais volta à sua cabeça? E o que você sabia naquela época que hoje parece esquecer?",
      },
      {
        id: "perfeicao",
        label: "Me cobro uma perfeição que não consigo sustentar na rotina.",
        head: "Cobrança sem descanso.",
        short: "Você exige de si uma perfeição que ninguém sustenta, e qualquer falha vira prova contra você.",
        mirror: "se cobra uma perfeição que não dá para sustentar na rotina",
        opening: "Quando você se cobra desse jeito, de quem é a voz que você escuta?",
      },
      {
        id: "alerta",
        label: "Por fora finjo que está tudo bem, mas por dentro estou sempre em alerta.",
        head: "Calma por fora, alerta por dentro.",
        short: "Manter a aparência de que está tudo bem gasta uma energia que ninguém vê.",
        mirror: "mostra que está tudo bem por fora, mas por dentro segue em alerta",
        opening: "Se você pudesse baixar a guarda por um dia inteiro, o que teria medo que acontecesse?",
      },
    ],
  },
  {
    id: "sobrecarga",
    label: "Aliviar o cansaço de carregar tudo sozinha.",
    bridge: "Com tanta coisa para resolver, encontrar um momento para você acaba ficando para depois.",
    patternName: "Carregar tudo sozinha",
    title: "Você virou a pessoa que segura tudo — e ninguém segura você.",
    insight:
      "Dar conta de tudo pode parecer força por fora. Por dentro, costuma ser uma rotina sem pausa, em que as suas próprias necessidades ficam sempre para amanhã.",
    patterns: [
      {
        id: "desmorona",
        label: "Sinto que se eu parar um pouco, tudo à minha volta desmorona.",
        head: "Sem direito a pausa.",
        short: "Você sente que tudo depende de você, então parar parece um risco, não um descanso.",
        mirror: "sente que, se parar um pouco, tudo à sua volta desmorona",
        opening: "Se você parasse por um dia, o que exatamente você acha que desmoronaria primeiro?",
      },
      {
        id: "pilar",
        label: "Sou quem resolve tudo para os outros, mas não tenho com quem contar quando preciso.",
        head: "Pilar sem apoio.",
        short: "Você resolve tudo para os outros, mas não tem com quem contar quando precisa.",
        mirror: "resolve tudo para os outros, mas não tem com quem contar quando precisa",
        opening: "Quando foi a última vez que alguém resolveu alguma coisa por você? Como foi?",
      },
      {
        id: "irrita",
        label: "Pequenas cobranças do dia a dia me irritam além da conta.",
        head: "Cansaço disfarçado de irritação.",
        short: "Quando coisas pequenas irritam demais, normalmente é o acúmulo falando, não o detalhe.",
        mirror: "tem se irritado além da conta com pequenas cobranças do dia a dia",
        opening: "Qual foi a última coisa pequena que te irritou muito? O que ela tinha de maior por trás?",
      },
      {
        id: "afastar",
        label: "Tenho vontade de me afastar de tudo por uns dias, só para não ter que lidar com mais cobranças.",
        head: "No limite da sobrecarga.",
        short: "Querer sumir uns dias é o sinal de que a rotina passou do que você consegue carregar.",
        mirror: "tem vontade de se afastar de tudo por uns dias, só para não lidar com mais cobranças",
        opening: "Se você tivesse esses dias só para você, o que mais gostaria de não precisar fazer?",
      },
    ],
  },
];

export interface SimpleOption {
  id: string;
  label: string;
  head: string;
  text: string;
}

export const BARRIERS: SimpleOption[] = [
  {
    id: "guarda",
    label: "Guardo tudo para mim, com medo de ser julgada.",
    head: "Sobrecarga em silêncio.",
    text: "Sem um espaço seguro para falar sem julgamento, tudo fica girando dentro da sua cabeça.",
  },
  {
    id: "incomoda",
    label: "Tento desabafar, mas sinto que incomodo ou ouço \"deixa pra lá\".",
    head: "Sem ser ouvida.",
    text: "Ouvir \"deixa pra lá\" faz você desistir de falar, mas não de sentir.",
  },
  {
    id: "sozinha",
    label: "Tento resolver sozinha, mas volto sempre aos mesmos pensamentos.",
    head: "Pensando em círculos.",
    text: "Sozinha, a cabeça volta sempre ao mesmo ponto. É difícil ver a saída de dentro do labirinto.",
  },
  {
    id: "acesso",
    label: "Queria acompanhamento, mas não cabe no bolso ou na rotina.",
    head: "Apoio fora de alcance.",
    text: "Acompanhamento que não cabe no bolso ou na rotina não deveria significar ficar sem nenhum apoio.",
  },
];

export const STARTS: SimpleOption[] = [
  {
    id: "desabafo",
    label: "Conseguir falar tudo o que venho guardando, sem medo de ser julgada ou parecer dramática.",
    head: "Um lugar sem julgamento.",
    text: "Falar por áudio ou texto na hora em que o aperto bater, sem precisar parecer forte.",
  },
  {
    id: "encontro",
    label: "Entender melhor o que estou vivendo e conseguir enxergar com mais clareza o que fazer.",
    head: "Clareza com começo, meio e fim.",
    text: "Um encontro guiado de 45 minutos que parte da sua situação e termina com algo concreto para levar.",
  },
  {
    id: "praticas",
    label: "Conseguir desacelerar os pensamentos, ter um pouco de paz e descansar melhor à noite.",
    head: "Desacelerar antes de dormir.",
    text: "Orações e meditações guiadas para quando a cabeça acelera, e a AURA para conversar sobre o que aparecer.",
  },
  {
    id: "presenca",
    label: "Ter com quem conversar quando eu não estiver bem, sem precisar esperar ou guardar tudo para mim.",
    head: "Com quem contar, a qualquer hora.",
    text: "Abrir a conversa quando não estiver bem, sem marcar nem esperar e sem segurar tudo sozinha.",
  },
];

export interface QuizAnswers {
  theme: ThemeId;
  pattern: string;
  barrier: string;
  start: string;
}

export interface ReadingCard { head: string; text: string }

export interface QuizReading {
  patternName: string;
  title: string;
  living: ReadingCard;
  barrier: ReadingCard;
  start: ReadingCard;
  opening: string;
}

/** Monta a leitura final a partir das 4 respostas. Retorna null se algo não bater. */
export function composeReading(a: QuizAnswers): QuizReading | null {
  const theme = THEMES.find((t) => t.id === a.theme);
  const pattern = theme?.patterns.find((p) => p.id === a.pattern);
  const barrier = BARRIERS.find((b) => b.id === a.barrier);
  const start = STARTS.find((s) => s.id === a.start);
  if (!theme || !pattern || !barrier || !start) return null;
  return {
    patternName: theme.patternName,
    title: theme.title,
    living: { head: pattern.head, text: pattern.short },
    barrier: { head: barrier.head, text: barrier.text },
    start: { head: start.head, text: start.text },
    opening: `Vamos começar por aqui. ${pattern.opening}`,
  };
}
