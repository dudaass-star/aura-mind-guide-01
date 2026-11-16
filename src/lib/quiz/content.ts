// Conteúdo do quiz de aquisição (/quiz). Texto fixo e revisado por combinação;
// nada aqui é gerado por IA nem enviado à Meta.

export type ThemeId = "relacoes" | "limites" | "mente" | "sobrecarga" | "rumo";

export interface PatternOption {
  id: string;
  label: string;
  /** Espelho da escolha, em 2ª pessoa, sem exagerar o comportamento. */
  mirror: string;
  /** Pergunta de abertura da AURA na prévia do 1º encontro. */
  opening: string;
}

export interface Theme {
  id: ThemeId;
  label: string;
  bridge: string;
  title: string;
  insight: string;
  patterns: PatternOption[];
}

export const THEMES: Theme[] = [
  {
    id: "relacoes",
    label: "Sentir mais segurança nos meus relacionamentos e parar de me anular para caber no outro.",
    bridge: "Quando isso acontece com frequência, pode ser difícil pensar em outra coisa.",
    title: "Você está tentando encontrar segurança em algo que não consegue controlar.",
    insight:
      "Talvez o mais desgastante não seja só o medo de perder alguém. É quanto espaço essa preocupação passou a ocupar no seu dia — e quão pouco sobra para perceber o que você mesma precisa.",
    patterns: [
      {
        id: "atenta",
        label: "Fico atenta a cada mudança de humor ou atitude da pessoa, e isso consome meu dia.",
        mirror: "fica atenta a cada mudança de humor ou atitude da pessoa, e isso tem consumido seu dia",
        opening: "Quando você percebe alguma mudança no jeito dela, o que costuma passar pela sua cabeça naquele momento?",
      },
      {
        id: "cede",
        label: "Abro mão da minha paz e engulo o que penso só para evitar briga ou rejeição.",
        mirror: "costuma engolir o que pensa para evitar briga ou rejeição",
        opening: "Qual foi a última vez que você deixou de dizer algo para não criar atrito? O que você queria ter dito?",
      },
      {
        id: "cenarios",
        label: "Tenho dificuldade de confiar e acabo criando cenários ruins na cabeça.",
        mirror: "tem dificuldade de confiar e acaba criando cenários ruins na cabeça",
        opening: "Quando um desses cenários aparece, o que costuma acontecer logo antes? Uma mensagem, um silêncio, um gesto?",
      },
      {
        id: "invisivel",
        label: "Me sinto sozinha ou invisível, mesmo quando a gente está junto.",
        mirror: "se sente sozinha ou invisível, mesmo quando vocês estão juntos",
        opening: "Em que momentos essa sensação de estar sozinha aparece mais forte, mesmo com a pessoa do lado?",
      },
    ],
  },
  {
    id: "limites",
    label: "Conseguir dizer não sem culpa e parar de engolir o que sinto para não criar atrito.",
    bridge: "Nem sempre é fácil falar o que você precisa, principalmente quando está acostumada a ceder.",
    title: "Você cuida de todo mundo com tanto cuidado que acaba ficando por último.",
    insight:
      "Ceder às vezes evita um desconforto na hora. Mas, quando vira regra, a conta chega depois — em cansaço, irritação ou na sensação de que ninguém percebe o que você faz.",
    patterns: [
      {
        id: "sim",
        label: "Digo \"sim\" quando queria dizer \"não\", e depois fico com raiva de mim mesma.",
        mirror: "diz \"sim\" quando queria dizer \"não\" e depois fica com raiva de si mesma",
        opening: "Pensa no último \"sim\" que você se arrependeu de ter dado. O que você imaginou que aconteceria se dissesse \"não\"?",
      },
      {
        id: "culpa",
        label: "Quando tento me posicionar ou impor um limite, sinto uma culpa imediata.",
        mirror: "sente uma culpa imediata quando tenta se posicionar ou colocar um limite",
        opening: "Quando essa culpa aparece, que frase costuma vir junto na sua cabeça?",
      },
      {
        id: "espera",
        label: "Fico esperando que os outros percebam meu cansaço, e como ninguém nota, me fecho.",
        mirror: "espera que os outros percebam seu cansaço e, quando ninguém nota, se fecha",
        opening: "Se alguém perguntasse hoje, de verdade, como você está — o que você responderia?",
      },
      {
        id: "ninguem",
        label: "Cuido de todo mundo, mas quase ninguém pergunta como eu realmente estou.",
        mirror: "cuida de todo mundo, mas quase ninguém pergunta como você realmente está",
        opening: "De todas as pessoas que você cuida, de qual delas você sente mais falta de receber o mesmo cuidado?",
      },
    ],
  },
  {
    id: "mente",
    label: "Conseguir desacelerar a cabeça e parar de repassar conversas e preocupações o tempo todo.",
    bridge: "E muitas vezes esses pensamentos aparecem justamente quando você tenta descansar.",
    title: "Sua cabeça continua trabalhando mesmo quando o dia já acabou.",
    insight:
      "Pensar muito não é defeito. O difícil é quando os mesmos pensamentos voltam sem levar a lugar nenhum — e ocupam o tempo que deveria ser de descanso.",
    patterns: [
      {
        id: "noite",
        label: "Ao deitar na cama, a cabeça acelera repassando conversas, erros e cobranças.",
        mirror: "deita na cama e a cabeça acelera repassando conversas, erros e cobranças",
        opening: "Qual conversa ou cobrança mais tem voltado à sua cabeça nessas noites?",
      },
      {
        id: "passado",
        label: "Fico presa em decisões antigas, pensando no que eu deveria ter feito diferente.",
        mirror: "fica presa em decisões antigas, pensando no que deveria ter feito diferente",
        opening: "Qual decisão mais volta à sua cabeça? E o que você sabia naquela época que hoje parece esquecer?",
      },
      {
        id: "perfeicao",
        label: "Me cobro uma perfeição que não consigo sustentar na rotina.",
        mirror: "se cobra uma perfeição que não dá para sustentar na rotina",
        opening: "Quando você se cobra desse jeito, de quem é a voz que você escuta?",
      },
      {
        id: "alerta",
        label: "Por fora finjo que está tudo bem, mas por dentro estou sempre em alerta.",
        mirror: "mostra que está tudo bem por fora, mas por dentro segue em alerta",
        opening: "Se você pudesse baixar a guarda por um dia inteiro, o que teria medo que acontecesse?",
      },
    ],
  },
  {
    id: "sobrecarga",
    label: "Aliviar o cansaço de ter que dar conta de tudo sozinha e estar sempre no meu limite.",
    bridge: "Com tanta coisa para resolver, encontrar um momento para você acaba ficando para depois.",
    title: "Você virou a pessoa que segura tudo — e ninguém segura você.",
    insight:
      "Dar conta de tudo pode parecer força por fora. Por dentro, costuma ser uma rotina sem pausa, em que as suas próprias necessidades ficam sempre para amanhã.",
    patterns: [
      {
        id: "desmorona",
        label: "Sinto que se eu parar um pouco, tudo à minha volta desmorona.",
        mirror: "sente que, se parar um pouco, tudo à sua volta desmorona",
        opening: "Se você parasse por um dia, o que exatamente você acha que desmoronaria primeiro?",
      },
      {
        id: "pilar",
        label: "Sou quem resolve tudo para os outros, mas não tenho com quem contar quando preciso.",
        mirror: "resolve tudo para os outros, mas não tem com quem contar quando precisa",
        opening: "Quando foi a última vez que alguém resolveu alguma coisa por você? Como foi?",
      },
      {
        id: "irrita",
        label: "Pequenas cobranças do dia a dia me irritam além da conta.",
        mirror: "tem se irritado além da conta com pequenas cobranças do dia a dia",
        opening: "Qual foi a última coisa pequena que te irritou muito? O que ela tinha de maior por trás?",
      },
      {
        id: "afastar",
        label: "Tenho vontade de me afastar de tudo por uns dias, só para não ter que lidar com mais cobranças.",
        mirror: "tem vontade de se afastar de tudo por uns dias, só para não lidar com mais cobranças",
        opening: "Se você tivesse esses dias só para você, o que mais gostaria de não precisar fazer?",
      },
    ],
  },
  {
    id: "rumo",
    label: "Sair do piloto automático e reencontrar clareza sobre o que eu realmente quero.",
    bridge: "Quando os dias ficam parecidos, pode ser difícil perceber o que você realmente quer mudar.",
    title: "Você está cumprindo os dias, mas sente falta de saber para onde está indo.",
    insight:
      "O piloto automático protege de decisões difíceis, mas cobra um preço: a sensação de que a vida está passando sem que você escolha de verdade o caminho.",
    patterns: [
      {
        id: "repete",
        label: "Continuo repetindo atitudes e escolhas que eu já sei que vão me machucar depois.",
        mirror: "continua repetindo escolhas que já sabe que vão te machucar depois",
        opening: "Qual escolha você mais se pega repetindo? O que ela te dá na hora, mesmo sabendo o custo depois?",
      },
      {
        id: "clareza",
        label: "Perdi a clareza do que eu realmente quero para os próximos meses.",
        mirror: "perdeu a clareza do que realmente quer para os próximos meses",
        opening: "Houve algum momento recente, mesmo pequeno, em que você se sentiu um pouco mais você?",
      },
      {
        id: "desanimo",
        label: "Faço minhas obrigações diárias, mas no fundo sinto um desânimo constante.",
        mirror: "cumpre as obrigações do dia a dia, mas sente um desânimo constante no fundo",
        opening: "Se esse desânimo pudesse falar, o que você acha que ele diria que está faltando?",
      },
      {
        id: "sobrevivendo",
        label: "Sinto que os dias estão passando e eu estou apenas sobrevivendo, não vivendo.",
        mirror: "sente que os dias estão passando e você só está sobrevivendo",
        opening: "Como seria, na prática, um dia em que você sentisse que está vivendo — e não só sobrevivendo?",
      },
    ],
  },
];

export interface SimpleOption {
  id: string;
  label: string;
  text: string;
}

export const BARRIERS: SimpleOption[] = [
  {
    id: "guarda",
    label: "Guardo tudo para mim. Não sinto segurança de me abrir sem ser julgada ou incompreendida.",
    text: "Você também contou que costuma guardar tudo para si, porque não se sente segura para se abrir sem julgamento. Faz sentido que tudo fique girando por dentro quando não há onde colocar.",
  },
  {
    id: "incomoda",
    label: "Até tento desabafar com amigos ou família, mas sinto que estou incomodando ou ouço conselhos do tipo \"deixa pra lá\".",
    text: "Você contou que até tenta falar com quem está por perto, mas sente que incomoda ou ouve um \"deixa pra lá\". Isso faz a gente desistir de falar — não de sentir.",
  },
  {
    id: "sozinha",
    label: "Tento resolver tudo sozinha na minha cabeça, mas acabo voltando sempre para os mesmos pensamentos.",
    text: "Você contou que tenta resolver tudo sozinha na cabeça e acaba voltando aos mesmos pensamentos. É difícil enxergar saída de dentro do próprio labirinto.",
  },
  {
    id: "acesso",
    label: "Queria ter um acompanhamento regular, mas hoje não cabe no meu bolso ou na minha rotina.",
    text: "Você contou que gostaria de um acompanhamento regular, mas hoje ele não cabe no bolso ou na rotina. Isso não deveria significar ficar sem nenhum espaço para cuidar disso.",
  },
  {
    id: "complemento",
    label: "Já tenho algum apoio, mas sinto falta de ter com quem falar no exato momento em que a angústia aparece.",
    text: "Você contou que já tem algum apoio, mas sente falta de alguém no exato momento em que a angústia aparece — que quase nunca é no horário marcado.",
  },
];

export const STARTS: SimpleOption[] = [
  {
    id: "desabafo",
    label: "Colocando para fora por áudio ou texto tudo o que guardei durante a semana.",
    text: "Você pode começar falando por áudio ou texto, no seu ritmo, a qualquer hora. A AURA escuta, faz perguntas e lembra do que você já contou — você não precisa explicar tudo de novo.",
  },
  {
    id: "encontro",
    label: "Fazendo um encontro guiado e com foco para clarear essa situação e ver caminhos práticos.",
    text: "Você pode começar por um encontro guiado de 45 minutos, com começo, meio e fim, que parte exatamente dessa situação e termina com algo concreto para você levar.",
  },
  {
    id: "praticas",
    label: "Ouvindo áudios de reflexão e orações para desacelerar a cabeça antes de dormir.",
    text: "Você pode começar pelas orações e meditações guiadas para os momentos em que a cabeça acelera — e, quando quiser, conversar com a AURA sobre o que apareceu.",
  },
  {
    id: "presenca",
    label: "Tendo uma presença calma no bolso para me ajudar a raciocinar quando tudo parecer confuso.",
    text: "Você pode abrir a conversa sempre que tudo parecer confuso. A AURA ajuda a organizar o que está acontecendo e a enxergar o que pode estar passando despercebido.",
  },
];

export interface QuizAnswers {
  theme: ThemeId;
  pattern: string;
  barrier: string;
  start: string;
}

export interface QuizReading {
  title: string;
  living: string;
  barrier: string;
  start: string;
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
    title: theme.title,
    living: `Você contou que ${pattern.mirror}. ${theme.insight}`,
    barrier: barrier.text,
    start: start.text,
    opening: `Você me contou que ${pattern.mirror}. Quero começar entendendo uma coisa: ${pattern.opening.charAt(0).toLowerCase()}${pattern.opening.slice(1)}`,
  };
}
