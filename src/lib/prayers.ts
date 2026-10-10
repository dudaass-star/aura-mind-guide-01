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

export interface PrayerTrack {
  id: string;
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
];
