import { useState } from "react";
import { ArrowLeft, Mic, Play, SendHorizontal } from "lucide-react";
import avatarAura from "@/assets/avatar-aura.jpg";
import "./preview-conversa/preview-conversa.css";

// Página de prévia apenas visual: compara 3 estilos da conversa com uma sessão de exemplo.
type Tema = "santuario" | "diario" | "ritual";
type Msg = { de: "aura" | "eu"; texto?: string; destaque?: boolean; audio?: string; hora: string };

const SESSAO: Msg[] = [
  { de: "aura", texto: "Oi, Marina. Que bom te ver de novo por aqui.", hora: "19:02" },
  { de: "aura", texto: "Da última vez você falou da sensação de estar sempre correndo atrás, como se nunca fosse suficiente. Como isso ficou ao longo da semana?", hora: "19:02" },
  { de: "eu", texto: "Ficou parecido. Terminei o projeto do trabalho, mas no mesmo dia já estava pensando no próximo. Nem comemorei.", hora: "19:04" },
  { de: "aura", texto: "Repara numa coisa: você entregou, e a primeira coisa que fez foi tirar o valor do que entregou.", hora: "19:05" },
  { de: "aura", texto: "Talvez o problema não seja o quanto você faz, e sim quem decide quando é suficiente.", destaque: true, hora: "19:05" },
  { de: "aura", audio: "0:48", hora: "19:05" },
  { de: "eu", texto: "Nossa. Acho que quem decide nunca sou eu.", hora: "19:07" },
  { de: "aura", texto: "Então vamos olhar pra isso com calma. Se fosse você quem decidisse, o que teria mudado na terça-feira?", hora: "19:08" },
];

const TEMAS: { id: Tema; nome: string }[] = [
  { id: "santuario", nome: "Santuário" },
  { id: "diario", nome: "Diário" },
  { id: "ritual", nome: "Ritual" },
];

const FASES = ["Presença", "Exploração", "Ressignificação", "Fechamento"];

function Onda() {
  const alturas = [8, 14, 20, 12, 22, 16, 10, 18, 24, 14, 9, 17, 21, 12, 8, 15, 19, 11, 7, 13];
  return <span className="pc-wave flex items-center gap-[3px]">{alturas.map((h, i) => <span key={i} style={{ height: h }} />)}</span>;
}

export default function PreviewConversa() {
  const [tema, setTema] = useState<Tema>("santuario");
  const [emSessao, setEmSessao] = useState(true);
  const casual = tema === "ritual" && !emSessao;
  const diario = tema === "diario" || casual;
  const fase = 2;

  return (
    <div className="pc-root flex flex-col" data-theme={tema} data-casual={casual}>
      {/* Seletor da prévia (não faz parte do design) */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-center gap-2 border-b pc-border pc-surface px-3 py-2">
        {TEMAS.map((t) => (
          <button key={t.id} onClick={() => setTema(t.id)} className={`rounded-full px-4 py-1.5 text-sm font-bold ${tema === t.id ? "pc-chip-on" : "pc-muted"}`}>{t.nome}</button>
        ))}
        {tema === "ritual" && (
          <button onClick={() => setEmSessao(!emSessao)} className="rounded-full border pc-border px-3 py-1.5 text-xs font-semibold pc-text">
            {emSessao ? "Ver conversa do dia a dia" : "Ver encontro guiado"}
          </button>
        )}
      </div>

      <div className="relative mx-auto flex w-full max-w-xl flex-1 flex-col pc-ambient">
        {/* Cabeçalho */}
        <header className="flex items-center gap-3 px-4 pb-3 pt-4">
          <ArrowLeft className="h-5 w-5 pc-muted" />
          {tema === "ritual" && emSessao ? (
            <span className="pc-ring" style={{ ["--pc-p" as string]: "58%" }}>
              <img src={avatarAura} alt="AURA" className="h-11 w-11 rounded-full object-cover" />
            </span>
          ) : (
            <img src={avatarAura} alt="AURA" className="h-11 w-11 rounded-full object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <p className={`text-base font-bold pc-text ${diario ? "pc-serif" : ""}`}>AURA</p>
            <p className="text-xs pc-muted">
              {tema === "ritual" && emSessao ? `Encontro · 26 de 45 min` : casual ? "Por aqui com você" : "Encontro em andamento · 26 min"}
            </p>
          </div>
        </header>

        {tema === "ritual" && emSessao && (
          <div className="flex gap-1.5 px-4 pb-2">
            {FASES.map((f, i) => (
              <div key={f} className="flex-1">
                <div className={`h-1 rounded-full ${i <= fase ? "pc-cta" : "pc-surface"}`} />
                <p className={`mt-1 text-[10px] font-semibold ${i === fase ? "pc-sage" : "pc-muted"}`}>{f}</p>
              </div>
            ))}
          </div>
        )}

        {/* Mensagens */}
        <main className="flex-1 space-y-4 px-5 py-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] pc-muted">Hoje · 19:00</p>
          {SESSAO.map((m, i) => {
            if (m.de === "eu") {
              return (
                <div key={i} className="pc-fade flex justify-end" style={{ animationDelay: `${i * 60}ms` }}>
                  <p className="pc-user max-w-[82%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed">{m.texto}</p>
                </div>
              );
            }
            if (m.audio) {
              return (
                <div key={i} className="pc-fade flex items-center gap-3 rounded-full border pc-border pc-surface py-2 pl-2 pr-5 w-fit" style={{ animationDelay: `${i * 60}ms` }}>
                  <span className="pc-cta flex h-9 w-9 items-center justify-center rounded-full"><Play className="h-4 w-4 fill-current" /></span>
                  <Onda />
                  <span className="text-xs pc-muted">{m.audio}</span>
                </div>
              );
            }
            if (m.destaque) {
              return (
                <p key={i} className={`pc-fade pc-highlight py-1 text-xl leading-snug pc-text ${diario ? "pc-serif italic" : "font-semibold"}`} style={{ animationDelay: `${i * 60}ms` }}>
                  {m.texto}
                </p>
              );
            }
            return (
              <p key={i} className={`pc-fade max-w-[92%] pc-text ${diario ? "pc-serif text-[17px] leading-[1.7]" : "text-base leading-[1.65]"}`} style={{ animationDelay: `${i * 60}ms` }}>
                {m.texto}
              </p>
            );
          })}
        </main>

        {/* Barra de escrita */}
        <footer className="sticky bottom-0 px-4 pb-5 pt-2 pc-bg">
          <div className="flex items-center gap-2 rounded-full border pc-border pc-surface py-1.5 pl-5 pr-1.5">
            <span className="flex-1 text-[15px] pc-muted">Escreva no seu tempo…</span>
            <Mic className="h-5 w-5 pc-muted" />
            <span className="pc-cta flex h-10 w-10 items-center justify-center rounded-full"><SendHorizontal className="h-4 w-4" /></span>
          </div>
        </footer>
      </div>
    </div>
  );
}
