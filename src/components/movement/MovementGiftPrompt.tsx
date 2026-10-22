import { useEffect, useState } from "react";
import { Gift, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { trackMovement } from "@/lib/movement-analytics";
import { MOVEMENT_INVITE_MESSAGES, movementInviteUrl } from "@/lib/movement-invite";
import { writeGiftState } from "@/lib/movement-gift-cadence";

// Card sutil de presente: aparece raramente; o envio confirma a adesão como embaixadora.
export function MovementGiftPrompt({ userId, fullName, trigger, onClose }: { userId: string; fullName: string; trigger: "session" | "prayer"; onClose: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    writeGiftState(userId, { lastPromptAt: Date.now() });
    trackMovement("gift_prompt_shown", "app", { trigger });
    void supabasePortal.from("movement_members").select("referral_code").eq("user_id", userId).maybeSingle().then(({ data }) => setCode(data?.referral_code || null));
  }, [userId, trigger]);

  const shareFor = (referral: string) => `${MOVEMENT_INVITE_MESSAGES.user}\n${movementInviteUrl(referral)}`;

  const send = async () => {
    if (busy) return;
    let referral = code;
    const popup = referral ? null : window.open("about:blank", "_blank");
    if (!referral) {
      setBusy(true);
      const { data, error } = await supabasePortal.from("movement_members")
        .insert({ user_id: userId, public_name: fullName.trim() || "Participante", display_mode: "first_name", receive_updates: false, ambassador_since: new Date().toISOString() })
        .select("referral_code").single();
      setBusy(false);
      if (error || !data) { popup?.close(); trackMovement("gift_prompt_failed", "app", { trigger }); return; }
      referral = data.referral_code;
      trackMovement("member_joined", "app", { mode: "gift_prompt" });
    } else {
      // Já é membro: registra a escolha voluntária de indicar, se ainda não houver.
      void supabasePortal.from("movement_members").update({ ambassador_since: new Date().toISOString() }).eq("user_id", userId).is("ambassador_since", null).then(() => undefined);
    }
    const url = `https://wa.me/?text=${encodeURIComponent(shareFor(referral!))}`;
    if (popup) popup.location.href = url; else window.open(url, "_blank", "noopener");
    writeGiftState(userId, { sharedAt: Date.now() });
    trackMovement("whatsapp_share_started", "app", { trigger, origin: "gift_prompt" });
    onClose();
  };

  const dismiss = () => { trackMovement("gift_prompt_dismissed", "app", { trigger }); onClose(); };

  const text = trigger === "session"
    ? "Que bom que esse momento te fez bem. Você pode presentear uma amiga, mãe ou irmã com um primeiro encontro gratuito de 45 minutos com a Aura."
    : "Lembrou de alguém que está precisando de conforto hoje? Presenteie com um encontro gratuito de 45 minutos com a Aura.";

  return (
    <section className="rounded-lg border border-primary/30 bg-card p-4 text-card-foreground shadow-sm" aria-label="Presentear alguém com um encontro">
      <p className="flex items-center gap-2 text-xs font-semibold text-primary"><Gift className="h-4 w-4" /> Movimento Olá Aura</p>
      <p className="mt-2 text-sm leading-relaxed">{text}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void send()} disabled={busy}><MessageCircle /> {busy ? "Preparando…" : "Enviar convite no WhatsApp"}</Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={dismiss}>Agora não</Button>
      </div>
    </section>
  );
}
