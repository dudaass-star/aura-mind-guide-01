import { ArrowRight } from "lucide-react";
import { auraWhatsAppLink } from "./whatsapp";

// Perguntas rotacionadas de forma determinística por dia.
// Mantidas curtas, abertas, sem julgamento — coerente com a postura da Aura.
const PERGUNTAS = [
  "Uma coisa que ficou pesada essa semana?",
  "O que você tá evitando olhar?",
  "Tem algo que você adiaria hoje se pudesse?",
  "Onde tá indo sua energia essa semana?",
  "O que te tirou do sério nos últimos dias?",
  "Tem uma decisão pendente rondando?",
  "Onde você tá se cobrando demais?",
  "O que te deu leveza recentemente?",
  "Que conversa você tá adiando?",
  "Um pensamento que volta muito ultimamente?",
  "Onde você tá sendo dura contigo?",
  "Que padrão você tá vendo se repetir?",
  "O que tá te tirando o sono?",
  "Uma pequena vitória que passou batida?",
  "Onde você tá em piloto automático?",
  "O que te faria bem ouvir agora?",
  "Que verdade você tá evitando dizer?",
  "O que mudou em você nos últimos meses?",
  "Tem alguém te pesando no peito?",
  "Que espaço você não tá se dando?",
  "Onde tá seu foco essa semana?",
  "O que tá gritando por atenção?",
  "Que promessa a você mesma tá vencida?",
  "O que te move quando tudo parece parado?",
  "Uma coisa boa que aconteceu que você não celebrou?",
  "Onde você tá pedindo desculpa demais?",
  "Que sensação corporal tá te dizendo algo?",
  "O que você faria diferente da semana passada?",
  "Onde você tá esperando permissão pra agir?",
  "Que pergunta te acompanha nesses dias?",
];

function perguntaDoDia(): string {
  const dayKey = Math.floor(Date.now() / 86_400_000);
  return PERGUNTAS[dayKey % PERGUNTAS.length];
}

interface Props {
  lastUserMessageAt?: string | null;
}

export function PerguntaDoDiaCard({ lastUserMessageAt }: Props) {
  // Se conversou nas últimas 4h, não empurra a pergunta (já tá em conversa).
  if (lastUserMessageAt) {
    const diffMs = Date.now() - new Date(lastUserMessageAt).getTime();
    if (diffMs < 4 * 3_600_000) return null;
  }

  const pergunta = perguntaDoDia();
  const link = auraWhatsAppLink(pergunta);

  return (
    <div className="rounded-2xl bg-[#87A878]/12 border border-[#87A878]/30 p-6 space-y-4 animate-fade-up">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#87A878] font-bold font-['Nunito']">
        Pergunta do dia
      </p>
      <p className="text-[#1B2A4E] font-['Fraunces'] text-xl leading-snug" style={{ fontWeight: 500 }}>
        {pergunta}
      </p>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full bg-[#1B2A4E] text-white px-4 py-2 text-xs font-bold font-['Nunito'] uppercase tracking-wider hover:bg-[#1B2A4E]/90 transition-colors"
      >
        Responder com a Aura
        <ArrowRight size={14} />
      </a>
    </div>
  );
}