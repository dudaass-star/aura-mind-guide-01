import { useState } from "react";
import { Loader2, Phone } from "lucide-react";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import { usePortalAuth } from "@/contexts/PortalAuthContext";

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function PhoneLinkPrompt() {
  const { linkByPhone, linkStatus, signOut } = usePortalAuth();
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = phone.replace(/\D/g, "");
  const isValid = digits.length === 10 || digits.length === 11;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await linkByPhone(digits);
    console.warn("[PhoneLinkPrompt] linkByPhone result:", result);
    setSubmitting(false);
    if (result === "phone_taken") {
      setError("Esse número já está vinculado a outra conta. Fala com a gente pelo WhatsApp da Aura pra ajustar.");
    } else if (result === "needs_phone") {
      setError("Não encontramos esse número. Confere se é o mesmo WhatsApp que você usa pra falar com a Aura (com DDD).");
    } else if (result === "error") {
      setError("Algo deu errado de momento. Tenta de novo em instantes.");
    }
    // 'linked' → o UserPortal vai re-renderizar com as abas.
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="py-4 px-6 flex justify-center border-b border-border/50">
        <img src={logoOlaAura} alt="Olá AURA" className="h-14 w-auto" />
      </div>
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="bg-accent/10 rounded-full p-4 w-16 h-16 mx-auto flex items-center justify-center mb-5">
            <Phone size={26} className="text-accent" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2 text-center font-['Fraunces']">
            Confirma seu WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-6 font-['Nunito']">
            Pra encontrar sua conta, digita o WhatsApp que você cadastrou na assinatura (o mesmo que usa pra conversar com a Aura).
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="tel"
              inputMode="numeric"
              autoFocus
              value={phone}
              onChange={(e) => {
                setPhone(formatPhone(e.target.value));
                if (error) setError(null);
              }}
              placeholder="(DDD) 90000-0000"
              className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent font-['Nunito']"
            />

            {error && (
              <div className="text-sm text-destructive font-['Nunito'] space-y-2">
                <p>{error}</p>
                <a
                  href="https://wa.me/16625255005"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs underline text-accent hover:opacity-80"
                >
                  Falar com o suporte da Aura
                </a>
              </div>
            )}

            <button
              type="submit"
              disabled={!isValid || submitting || linkStatus === "linking"}
              className="w-full bg-accent text-accent-foreground rounded-lg py-3 font-medium font-['Nunito'] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              <span>Confirmar</span>
            </button>
          </form>

          <button
            onClick={signOut}
            className="mt-6 w-full text-sm text-muted-foreground hover:text-accent transition-colors font-['Nunito']"
          >
            Sair e entrar com outra conta
          </button>
        </div>
      </div>
    </div>
  );
}