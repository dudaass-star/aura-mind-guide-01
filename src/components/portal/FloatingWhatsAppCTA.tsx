import { MessageCircle } from "lucide-react";
import { auraWhatsAppLink } from "./whatsapp";

// Botão flutuante "Falar com a Aura" presente em todas as abas do /meu-espaco.
// Posicionado p/ não conflitar com footer do iOS Safari.
export function FloatingWhatsAppCTA({ prefilled }: { prefilled?: string }) {
  return (
    <a
      href={auraWhatsAppLink(prefilled)}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/20 px-4 py-3 text-sm font-['Nunito'] font-semibold hover:scale-105 hover:shadow-xl transition-all animate-fade-in"
      aria-label="Falar com a Aura no WhatsApp"
    >
      <MessageCircle size={18} />
      <span className="hidden sm:inline">Falar com a Aura</span>
    </a>
  );
}