import nightImage from "@/assets/prayer-night.jpg";
import nightAudio from "@/assets/prayer-night-audio.asset.json";
import nightCues from "@/lib/prayer-night-cues.json";
import directionImage from "@/assets/prayer-direction.jpg";
import directionAudio from "@/assets/prayer-direction-audio.asset.json";
import directionCues from "@/lib/prayer-direction-cues.json";
import restlessMindImage from "@/assets/prayer-restless-mind.jpg";
import restlessMindAudio from "@/assets/prayer-restless-mind-audio.asset.json";
import restlessMindCues from "@/lib/prayer-restless-mind-cues.json";
import lovedOnesImage from "@/assets/prayer-loved-ones.jpg";
import lovedOnesAudio from "@/assets/prayer-loved-ones-audio.asset.json";
import lovedOnesCues from "@/lib/prayer-loved-ones-cues.json";
import strengthImage from "@/assets/prayer-strength.jpg";
import strengthAudio from "@/assets/prayer-strength-audio.asset.json";
import strengthCues from "@/lib/prayer-strength-cues.json";
import stepsImage from "@/assets/prayer-steps.jpg";
import stepsAudio from "@/assets/prayer-steps-audio.asset.json";
import stepsCues from "@/lib/prayer-steps-cues.json";
import courageImage from "@/assets/prayer-courage.jpg";
import courageAudio from "@/assets/prayer-courage-audio.asset.json";
import courageCues from "@/lib/prayer-courage-cues.json";
import authenticityImage from "@/assets/prayer-authenticity.jpg";
import authenticityAudio from "@/assets/prayer-authenticity-audio.asset.json";
import authenticityCues from "@/lib/prayer-authenticity-cues.json";
import gratitudeImage from "@/assets/prayer-gratitude.jpg";
import gratitudeAudio from "@/assets/prayer-gratitude-audio.asset.json";
import gratitudeCues from "@/lib/prayer-gratitude-cues.json";
import lifeCompanionsImage from "@/assets/prayer-life-companions.jpg";
import lifeCompanionsAudio from "@/assets/prayer-life-companions-audio.asset.json";
import lifeCompanionsCues from "@/lib/prayer-life-companions-cues.json";
import morningPresenceImage from "@/assets/prayer-morning-presence.jpg";
import morningPresenceAudio from "@/assets/prayer-morning-presence-audio.asset.json";
import morningPresenceCues from "@/lib/prayer-morning-presence-cues.json";
import morningGuidanceImage from "@/assets/prayer-morning-guidance.jpg";
import morningGuidanceAudio from "@/assets/prayer-morning-guidance-audio.asset.json";
import morningGuidanceCues from "@/lib/prayer-morning-guidance-cues.json";
import hopeImage from "@/assets/prayer-hope.jpg";
import hopeAudio from "@/assets/prayer-hope-audio.asset.json";
import hopeCues from "@/lib/prayer-hope-cues.json";
import flourishImage from "@/assets/prayer-flourish.jpg";
import flourishAudio from "@/assets/prayer-flourish-audio.asset.json";
import flourishCues from "@/lib/prayer-flourish-cues.json";
import closenessImage from "@/assets/prayer-closeness.jpg";
import closenessAudio from "@/assets/prayer-closeness-audio.asset.json";
import closenessCues from "@/lib/prayer-closeness-cues.json";

export const PRAYER_CATEGORIES = ["Manhã", "Noite", "Força", "Coragem", "Gratidão", "Esperança", "Direção", "Amor", "Fé"] as const;
export type PrayerCategory = typeof PRAYER_CATEGORIES[number];

export interface PrayerTrack {
  id: string;
  category: PrayerCategory;
  title: string;
  moment: string;
  theme: string;
  description: string;
  image: string;
  imageAlt: string;
  audioUrl: string;
  duration: number;
  cues: { start: number; end: number; text: string }[];
}

export const PRAYERS: PrayerTrack[] = [
  {
    id: "prayer-night",
    category: "Noite",
    title: "Para entregar a Deus o que ficou sem resolver hoje",
    moment: "Para esta noite",
    theme: "Entrega e descanso",
    description: "Uma conversa inacabada. Uma preocupação que ficou. Uma oração para entregar o dia inteiro.",
    image: nightImage,
    imageAlt: "Lago tranquilo ao anoitecer visto de uma janela aberta",
    audioUrl: nightAudio.url,
    duration: 108.228,
    cues: nightCues,
  },
  {
    id: "prayer-direction",
    category: "Direção",
    title: "Quando não sei qual caminho seguir",
    moment: "Diante de uma decisão",
    theme: "Discernimento e coragem",
    description: "Entre seguir e esperar, uma oração por clareza para escolher e coragem para dar o próximo passo.",
    image: directionImage,
    imageAlt: "Caminho de pedras entre colinas verdes em direção à luz da manhã",
    audioUrl: directionAudio.url,
    duration: 107.606,
    cues: directionCues,
  },
  {
    id: "prayer-restless-mind",
    category: "Noite",
    title: "Quando a mente não desliga",
    moment: "Quando os pensamentos continuam",
    theme: "Presença e descanso",
    description: "O corpo parou, mas a cabeça continua cheia. Uma oração para entregar o que não precisa ser carregado agora.",
    image: restlessMindImage,
    imageAlt: "Poltrona verde junto a uma cortina leve, diante de um jardim iluminado pela lua",
    audioUrl: restlessMindAudio.url,
    duration: 104.571,
    cues: restlessMindCues,
  },
  {
    id: "prayer-loved-ones",
    category: "Amor",
    title: "Por quem eu amo",
    moment: "Por pessoas queridas",
    theme: "Amor e cuidado",
    description: "Perto ou longe, cada pessoa tem um lugar em nós. Uma oração de gratidão e cuidado por quem queremos ver bem.",
    image: lovedOnesImage,
    imageAlt: "Mãos de três gerações unidas sobre uma mesa verde em um jardim florido",
    audioUrl: lovedOnesAudio.url,
    duration: 121.854,
    cues: lovedOnesCues,
  },
  {
    id: "prayer-strength",
    category: "Força",
    title: "Deus, renova minhas forças",
    moment: "Para renovar as forças",
    theme: "Força e amparo",
    description: "Entregar o cansaço, acolher os próprios limites e encontrar em Deus sustento para continuar sem se abandonar.",
    image: strengthImage,
    imageAlt: "Oliveira enraizada entre rochas claras diante de um mar tranquilo à luz da manhã",
    audioUrl: strengthAudio.url,
    duration: 120.740,
    cues: strengthCues,
  },
  {
    id: "prayer-steps",
    category: "Força",
    title: "Deus, sustenta meus passos",
    moment: "Para caminhar com Deus",
    theme: "Força e amparo",
    description: "Encontrar firmeza, reconhecer a beleza da vida e seguir com o coração aberto ao cuidado de Deus.",
    image: stepsImage,
    imageAlt: "Caminho de pedras claras entre oliveiras e um campo verde sob o céu azul",
    audioUrl: stepsAudio.url,
    duration: 143.505,
    cues: stepsCues,
  },
  {
    id: "prayer-courage",
    category: "Coragem",
    title: "Coragem para viver a vida",
    moment: "Para viver com coragem",
    theme: "Coragem e presença",
    description: "Abrir o coração à vida, escolher com consciência e encontrar em Deus coragem para amar, aprender e participar.",
    image: courageImage,
    imageAlt: "Árvore em uma colina verde com flores pequenas diante de montanhas e um céu azul aberto",
    audioUrl: courageAudio.url,
    duration: 145.729,
    cues: courageCues,
  },
  {
    id: "prayer-authenticity",
    category: "Coragem",
    title: "Coragem para ser quem sou",
    moment: "Para ser quem sou",
    theme: "Coragem e presença",
    description: "Reconhecer o próprio valor, viver com verdade e crescer com Deus sem se abandonar para caber na vida dos outros.",
    image: authenticityImage,
    imageAlt: "Magnólia com flores brancas refletida em um lago tranquilo diante de montanhas",
    audioUrl: authenticityAudio.url,
    duration: 155.260,
    cues: authenticityCues,
  },
  {
    id: "prayer-gratitude",
    category: "Gratidão",
    title: "Obrigado pelo cuidado de cada dia",
    moment: "Para agradecer pela vida",
    theme: "Gratidão e cuidado",
    description: "Reconhecer a beleza do cotidiano, receber o cuidado com alegria e levar a gratidão para a maneira de viver.",
    image: gratitudeImage,
    imageAlt: "Mesa com flores, pão, frutas e água junto a uma janela aberta para um jardim iluminado",
    audioUrl: gratitudeAudio.url,
    duration: 120.798,
    cues: gratitudeCues,
  },
  {
    id: "prayer-life-companions",
    category: "Gratidão",
    title: "Pela vida e por quem caminha comigo",
    moment: "Pela vida e pelos encontros",
    theme: "Gratidão e cuidado",
    description: "Agradecer pela vida, reconhecer o amor nos encontros e demonstrar hoje o carinho que podemos oferecer.",
    image: lifeCompanionsImage,
    imageAlt: "Mesa com três xícaras e flores entre cadeiras e um banco em um jardim verde iluminado",
    audioUrl: lifeCompanionsAudio.url,
    duration: 141.411,
    cues: lifeCompanionsCues,
  },
  {
    id: "prayer-morning-presence",
    category: "Manhã",
    title: "Antes de começar, estou aqui",
    moment: "Para começar o dia com Deus",
    theme: "Manhã e presença",
    description: "Abrir o coração à presença de Deus e atravessar o dia com atenção, liberdade e amor nas pequenas escolhas.",
    image: morningPresenceImage,
    imageAlt: "Janela aberta com flores brancas diante de um campo verde e montanhas à luz da manhã",
    audioUrl: morningPresenceAudio.url,
    duration: 149.918,
    cues: morningPresenceCues,
  },
  {
    id: "prayer-morning-guidance",
    category: "Manhã",
    title: "Guia meus passos hoje",
    moment: "Para levar Deus comigo pelo dia",
    theme: "Manhã e presença",
    description: "Caminhar com Deus nas escolhas, nos encontros e no cotidiano, com discernimento, atenção e liberdade para escolher o bem.",
    image: morningGuidanceImage,
    imageAlt: "Ponte de pedras sobre um riacho entre flores e colinas verdes sob o céu azul da manhã",
    audioUrl: morningGuidanceAudio.url,
    duration: 155.532,
    cues: morningGuidanceCues,
  },
  {
    id: "prayer-hope",
    category: "Esperança",
    title: "Deus, renova minha esperança",
    moment: "Para renovar a esperança",
    theme: "Esperança e vida",
    description: "Manter o coração aberto à vida, reconhecer o bem presente e encontrar em Deus esperança para amar, aprender e seguir.",
    image: hopeImage,
    imageAlt: "Campo de flores diante de um vale verde com rio e montanhas iluminados pelo sol",
    audioUrl: hopeAudio.url,
    duration: 133.322,
    cues: hopeCues,
  },
  {
    id: "prayer-flourish",
    category: "Esperança",
    title: "Que eu possa florescer de novo",
    moment: "Para continuar florescendo",
    theme: "Esperança e vida",
    description: "Cuidar das próprias raízes, acolher o tempo de crescer e abrir espaço para a vida com liberdade, ternura e Deus por perto.",
    image: flourishImage,
    imageAlt: "Árvore com flores brancas e rosadas junto a um riacho em um vale verde sob céu azul",
    audioUrl: flourishAudio.url,
    duration: 171.776,
    cues: flourishCues,
  },
  {
    id: "prayer-closeness",
    category: "Fé",
    title: "Deus, quero estar mais perto de Ti",
    moment: "Para me aproximar de Deus",
    theme: "Fé e presença de Deus",
    description: "Estar com Deus pelo amor de quem Ele é. Um encontro de confiança, entrega e gratidão pela Sua presença.",
    image: closenessImage,
    imageAlt: "Portão aberto entre flores brancas para um jardim com lago e montanhas sob o céu azul",
    audioUrl: closenessAudio.url,
    duration: 142.885,
    cues: closenessCues,
  },
];
