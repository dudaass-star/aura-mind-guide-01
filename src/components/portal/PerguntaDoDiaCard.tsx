import { HelpCircle, ArrowRight } from "lucide-react";
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
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-5 space-y-3 shadow-sm animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-wider text-primary font-semibold font-['Nunito']">
          Pergunta do dia
        </p>
        <div className="bg-primary/10 rounded-full p-2 shrink-0">
          <HelpCircle size={18} className="text-primary" />
        </div>
      </div>
      <p className="text-foreground font-['Fraunces'] text-lg leading-relaxed">
        {pergunta}
      </p>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 font-['Nunito'] transition-colors"
      >
        Responder com a Aura
        <ArrowRight size={14} />
      </a>
    </div>
  );
}