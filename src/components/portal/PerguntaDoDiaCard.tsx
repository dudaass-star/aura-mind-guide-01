import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const dayKey = Math.floor(Date.parse(`${dateKey}T12:00:00Z`) / 86_400_000);
  return PERGUNTAS[dayKey % PERGUNTAS.length];
}

interface Props {
  lastUserMessageAt?: string | null;
  onRespond: (message: string) => void;
}

export function PerguntaDoDiaCard({ lastUserMessageAt, onRespond }: Props) {
  // Se conversou nas últimas 4h, não empurra a pergunta (já tá em conversa).
  if (lastUserMessageAt) {
    const diffMs = Date.now() - new Date(lastUserMessageAt).getTime();
    if (diffMs < 4 * 3_600_000) return null;
  }

  const pergunta = perguntaDoDia();
  return (
    <div className="rounded-2xl bg-[#87A878]/12 border border-[#87A878]/30 p-6 space-y-4 animate-fade-up">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#87A878] font-bold font-['Nunito']">
        Pergunta do dia
      </p>
      <p className="text-[#1B2A4E] font-['Fraunces'] text-xl leading-snug" style={{ fontWeight: 500 }}>
        {pergunta}
      </p>
      <Button type="button" onClick={() => onRespond(pergunta)} className="w-fit rounded-full px-4 text-xs font-bold font-['Nunito'] uppercase tracking-wider">
        Responder com a Aura
        <ArrowRight size={14} />
      </Button>
    </div>
  );
}