import { useState } from "react";
import { ChevronDown, Mic, Play } from "lucide-react";
import avatarAura from "@/assets/avatar-aura.jpg";
import "./preview-conversa/preview-conversa.css";

// Prévia apenas visual: a conversa como um encontro com alguém, sem cara de sistema.
type Luz = "noite" | "manha";
type Msg = { de: "aura" | "eu"; texto?: string; audio?: string; marcante?: boolean };

const SESSAO: Msg[] = [
  { de: "aura", texto: "Oi, Marina. Que bom te ver de novo." },
  { de: "aura", texto: "Fiquei pensando no que você disse da última vez, sobre estar sempre correndo atrás. Como foi a sua semana com isso?" },
  { de: "eu", texto: "Ficou parecido. Terminei o projeto do trabalho, mas no mesmo dia já estava pensando no próximo. Nem comemorei." },
  { de: "aura", texto: "Repara numa coisa: você entregou, e a primeira coisa que fez foi tirar o valor do que entregou." },
  { de: "aura", texto: "Talvez o problema não seja o quanto você faz, e sim quem decide quando é suficiente.", marcante: true },
  { de: "aura", audio: "0:48" },
  { de: "eu", texto: "Nossa. Acho que quem decide nunca sou eu." },
  { de: "aura", texto: "Então vamos olhar pra isso com calma. Se fosse você quem decidisse, o que teria mudado na terça-feira?" },
];

function Voz() {
  const alturas = [6, 10, 16, 9, 18, 12, 7, 14, 20, 11, 6, 13, 17, 9, 6, 12, 15, 8, 5, 10, 14, 7];
  return <span className="pc-voz flex items-center gap-[3px]">{alturas.map((h, i) => <span key={i} style={{ height: h }} />)}</span>;
}

export default function PreviewConversa() {
  const [luz, setLuz] = useState<Luz>("noite");

  return (
    <div className="pc-root" data-luz={luz}>
      <div className="pc-luz" aria-hidden />

      {/* Seletor da prévia (não faz parte do design) */}
      <div className="pc-seletor">
        <button onClick={() => setLuz("noite")} data-on={luz === "noite"}>À noite</button>
        <button onClick={() => setLuz("manha")} data-on={luz === "manha"}>De manhã</button>
      </div>

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col">
        {/* A Aura presente, como alguém na sala */}
        <header className="flex flex-col items-center px-6 pb-2 pt-14 text-center">
          <img src={avatarAura} alt="AURA" className="pc-rosto h-20 w-20 rounded-full object-cover" />
          <p className="pc-serif mt-3 text-2xl pc-texto">Aura</p>
          <p className="mt-1 text-sm pc-suave">aqui com você</p>
          <ChevronDown className="mt-4 h-4 w-4 pc-suave opacity-60" />
        </header>

        <main className="flex-1 space-y-6 px-6 pb-8 pt-6">
          {SESSAO.map((m, i) => {
            const atraso = { animationDelay: `${i * 90}ms` };
            if (m.de === "eu") {
              return (
                <div key={i} className="pc-surge flex justify-end" style={atraso}>
                  <p className="pc-eu max-w-[80%] rounded-[22px] px-4 py-3 text-[15.5px] leading-relaxed">{m.texto}</p>
                </div>
              );
            }
            if (m.audio) {
              return (
                <div key={i} className="pc-surge flex items-center gap-3" style={atraso}>
                  <span className="pc-play flex h-10 w-10 items-center justify-center rounded-full"><Play className="h-4 w-4 translate-x-[1px] fill-current" /></span>
                  <Voz />
                  <span className="text-xs pc-suave">{m.audio}</span>
                </div>
              );
            }
            if (m.marcante) {
              return (
                <p key={i} className="pc-surge pc-serif pc-marcante text-[22px] italic leading-snug pc-texto" style={atraso}>
                  {m.texto}
                </p>
              );
            }
            return (
              <p key={i} className="pc-surge pc-serif max-w-[94%] text-[18px] leading-[1.65] pc-texto" style={atraso}>
                {m.texto}
              </p>
            );
          })}

          <div className="pc-surge flex items-center gap-1.5 pt-1" style={{ animationDelay: "800ms" }} aria-label="Aura está ouvindo">
            <span className="pc-respira" /><span className="text-xs pc-suave">ouvindo você</span>
          </div>
        </main>

        {/* Espaço para falar, não um formulário */}
        <footer className="pc-rodape sticky bottom-0 px-6 pb-7 pt-6">
          <div className="flex items-center gap-3">
            <span className="pc-serif flex-1 border-b pc-linha pb-2 text-[17px] italic pc-suave">Fale no seu tempo…</span>
            <span className="pc-mic flex h-12 w-12 items-center justify-center rounded-full"><Mic className="h-5 w-5" /></span>
          </div>
        </footer>
      </div>
    </div>
  );
}
