import { useState } from "react";
import { Mic, Play } from "lucide-react";
import avatarAura from "@/assets/avatar-aura.jpg";
import "./preview-conversa/preview-conversa.css";

// Prévia apenas visual: a conversa como um encontro acolhedor com alguém.
type Luz = "noite" | "manha";
type Msg = { de: "aura" | "eu"; texto?: string; audio?: string; transcricao?: string };

const SESSAO: Msg[] = [
  { de: "aura", texto: "Oi, Marina. Que bom te ver de novo 🌿" },
  { de: "aura", texto: "Fiquei pensando no que você disse da última vez, sobre estar sempre correndo atrás. Como foi a sua semana com isso?" },
  { de: "eu", texto: "Ficou parecido. Terminei o projeto do trabalho, mas no mesmo dia já estava pensando no próximo. Nem comemorei." },
  { de: "aura", texto: "Repara numa coisa: você entregou, e a primeira coisa que fez foi tirar o valor do que entregou." },
  { de: "aura", texto: "Talvez o problema não seja o quanto você faz, e sim quem decide quando é suficiente." },
  { de: "aura", audio: "0:48", transcricao: "“Quero te dizer uma coisa com calma, Marina…”" },
  { de: "eu", texto: "Nossa. Acho que quem decide nunca sou eu." },
  { de: "aura", texto: "Então vamos olhar pra isso juntas, sem pressa. Se fosse você quem decidisse, o que teria mudado na terça-feira?" },
];

function Voz() {
  const a = [6, 10, 16, 9, 18, 12, 7, 14, 20, 11, 6, 13, 17, 9, 6, 12, 15, 8, 5, 10, 14, 7, 11, 16];
  return <span className="pc-voz flex flex-1 items-center gap-[3px]">{a.map((h, i) => <span key={i} style={{ height: h, animationDelay: `${i * 70}ms` }} />)}</span>;
}

export default function PreviewConversa() {
  const [luz, setLuz] = useState<Luz>("noite");
  let ultimo: string | null = null;

  return (
    <div className="pc-root" data-luz={luz}>
      <div className="pc-luz" aria-hidden />
      <div className="pc-grao" aria-hidden />

      <div className="pc-seletor">
        <button onClick={() => setLuz("noite")} data-on={luz === "noite"}>À noite</button>
        <button onClick={() => setLuz("manha")} data-on={luz === "manha"}>De manhã</button>
      </div>

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col">
        <header className="pc-topo sticky top-0 z-20 flex items-center gap-3 px-5 py-3">
          <span className="pc-halo"><img src={avatarAura} alt="AURA" className="h-10 w-10 rounded-full object-cover" /></span>
          <div className="leading-tight">
            <p className="text-[16px] font-extrabold pc-texto">Aura</p>
            <p className="flex items-center gap-1.5 text-[12px] pc-suave"><span className="pc-respira" />em sintonia com você</p>
          </div>
        </header>

        <main className="flex-1 px-5 pb-10 pt-5">
          <div className="pc-momento mx-auto mb-7 w-fit rounded-full px-4 py-1.5 text-[12px] font-semibold">
            Segunda, fim de tarde · seu momento de presença
          </div>

          <div className="space-y-2.5">
            {SESSAO.map((m, i) => {
              const troca = ultimo !== null && ultimo !== m.de;
              const primeiraAura = m.de === "aura" && ultimo !== "aura";
              ultimo = m.de;
              const st = { animationDelay: `${i * 110}ms` };
              const esp = troca ? "pt-5" : "";

              if (m.de === "eu") {
                return (
                  <div key={i} className={`pc-surge flex justify-end ${esp}`} style={st}>
                    <p className="pc-eu max-w-[82%] px-4 py-3 text-[15.5px] leading-relaxed">{m.texto}</p>
                  </div>
                );
              }
              const rosto = primeiraAura ? <img src={avatarAura} alt="" className="pc-mini h-7 w-7 rounded-full object-cover" /> : <span className="w-7 shrink-0" />;

              if (m.audio) {
                return (
                  <div key={i} className={`pc-surge flex items-end gap-2 ${esp}`} style={st}>
                    {rosto}
                    <div className="pc-cardvoz w-[84%] p-3.5">
                      <div className="flex items-center gap-3">
                        <span className="pc-play flex h-11 w-11 shrink-0 items-center justify-center rounded-full"><Play className="h-4 w-4 translate-x-[1px] fill-current" /></span>
                        <Voz />
                        <span className="text-[12px] font-semibold pc-suave">{m.audio}</span>
                      </div>
                      <p className="mt-2.5 text-[13.5px] italic pc-suave">{m.transcricao}</p>
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className={`pc-surge flex items-end gap-2 ${esp}`} style={st}>
                  {rosto}
                  <p className="pc-aura max-w-[84%] px-4 py-3 text-[16px] leading-[1.7] pc-texto">{m.texto}</p>
                </div>
              );
            })}
          </div>

          <div className="pc-surge mt-5 flex items-center gap-2 pl-9" style={{ animationDelay: "1000ms" }}>
            <span className="pc-pontos"><i /><i /><i /></span>
            <span className="text-[12.5px] italic pc-suave">a Aura está te ouvindo</span>
          </div>
        </main>

        <footer className="pc-rodape sticky bottom-0 px-5 pb-5 pt-8">
          <div className="pc-campo flex items-center gap-2 rounded-[28px] p-1.5 pl-5">
            <span className="flex-1 text-[15.5px] pc-suave">Pode falar no seu tempo…</span>
            <span className="pc-mic flex h-12 w-12 items-center justify-center rounded-full"><Mic className="h-5 w-5" /></span>
          </div>
        </footer>
      </div>
    </div>
  );
}
