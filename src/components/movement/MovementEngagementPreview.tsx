import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, HeartHandshake, MessageCircle, ShieldCheck, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import movementGroupImage from "@/assets/movimento-grupo-abraco-logo-real.jpg";

const motivations = ["Acredito que ninguém deveria enfrentar tudo sozinho", "Quero que mais pessoas encontrem escuta e direção", "Essa causa faz parte da minha história"];
const inviteMessages = {
  user: "Oi! Olha só o que eu descobri: a Olá Aura! Estou usando e está me fazendo muito bem. Acho que você vai adorar também.",
  supporter: "Oi! Olha só o que eu descobri: a Olá Aura! Conheci a proposta e achei fantástica. Acho que vale conhecer também!",
};
const inviteBody = "É um app pra conversar sobre o que você está vivendo e encontrar compreensão, apoio e direção — inclusive quando é difícil explicar o que está acontecendo.\n\nE tem uma coisa que me fez gostar ainda mais: o Movimento Olá Aura, pra que mais pessoas encontrem apoio e não precisem enfrentar tudo sozinhas. Estou fazendo parte e lembrei de você. 💚\n\nDá pra experimentar pelo valor de um cafezinho. ☕\n\nVem conhecer também! Depois me conta o que achou 👇";
const messageFor = (experience: keyof typeof inviteMessages) => `${inviteMessages[experience]}\n\n${inviteBody}`;

export function MovementEngagementPreview() {
  const [step, setStep] = useState<"motivation" | "invite" | "consent" | "composer" | "return">("motivation");
  const [role, setRole] = useState<"participant" | "ambassador">("participant");
  const [motivation, setMotivation] = useState("");
  const [experience, setExperience] = useState<keyof typeof inviteMessages>("supporter");
  const [message, setMessage] = useState(() => messageFor("supporter"));
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState("");
  const [pendingAction, setPendingAction] = useState<"whatsapp" | "copy">("whatsapp");

  const reset = (nextRole: typeof role) => {
    setRole(nextRole); setStep("motivation"); setMotivation(""); setConsent(false); setExperience("supporter"); setMessage(messageFor("supporter")); setNotice("");
  };
  const invite = (action: typeof pendingAction) => {
    setNotice(""); setPendingAction(action);
    if (role === "participant") { setStep("consent"); return; }
    if (action === "copy") { setNotice("Cópia simulada. Nenhum link real foi copiado."); return; }
    setStep("composer");
  };

  return <section id="previa-engajamento" className="scroll-mt-6">
    <header className="mb-5">
      <p className="text-xs font-bold uppercase text-primary">Prévia privada · não publicada</p>
      <h2 className="mt-2 font-display text-2xl font-semibold">Da participação ao primeiro convite</h2>
      <p className="mt-2 text-sm text-muted-foreground">Simulação sem salvar dados, mudar papéis ou enviar convites reais.</p>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Papel na prévia">
        <Button size="sm" variant={role === "participant" ? "default" : "outline"} onClick={() => reset("participant")}>Participante</Button>
        <Button size="sm" variant={role === "ambassador" ? "default" : "outline"} onClick={() => reset("ambassador")}>Embaixador</Button>
        <Button size="sm" variant="ghost" onClick={() => reset(role)}>Recomeçar prévia</Button>
      </div>
    </header>
    <div className="portal-chat-theme mx-auto max-w-xl bg-background text-foreground">
      <img src={movementGroupImage} alt="Grupo abraçado com camisetas Olá Aura" className="aspect-[16/7] w-full object-cover" />
      <div className="bg-primary px-5 py-5 text-primary-foreground sm:px-7">
        <p className="text-xs font-bold uppercase">Nosso Movimento</p>
        <h3 className="mt-2 font-display text-2xl font-semibold">Mais pessoas. Mais possibilidades de recomeço.</h3>
        <p className="mt-2 text-sm text-primary-foreground/90">Você faz parte desse começo.</p>
      </div>
      <div className="p-5 sm:p-7" aria-live="polite">
        {step === "motivation" && <>
          <HeartHandshake className="h-7 w-7 text-primary" />
          <h3 className="mt-3 font-display text-2xl font-semibold">O que faz você querer fazer parte?</h3>
          <div className="mt-5 space-y-2" role="group" aria-label="Sua motivação">
            {motivations.map((item) => <Button key={item} variant="outline" aria-pressed={motivation === item} className="h-auto min-h-12 w-full justify-start gap-3 whitespace-normal py-3 text-left" onClick={() => setMotivation(item)}><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary">{motivation === item && <Check className="h-3 w-3" />}</span>{item}</Button>)}
          </div>
          <label htmlFor="preview-motivation" className="mt-5 block text-sm font-medium">Ou conte com suas palavras</label>
          <Textarea id="preview-motivation" className="mt-2" value={motivation} onChange={(e) => setMotivation(e.target.value)} maxLength={280} placeholder="Essa causa importa para mim porque…" />
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" />Sua motivação fica só para você. Aparecer no Mural exige outra autorização.</p>
          <Button className="mt-5 w-full" disabled={!motivation.trim()} onClick={() => setStep("invite")}>Fazer parte desse começo <ArrowRight className="h-4 w-4" /></Button>
        </>}
        {(step === "invite" || step === "return") && <>
          <div className="flex items-start gap-3 border-b border-border pb-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--portal-journey))] text-[hsl(var(--portal-journey-foreground))]"><Check className="h-5 w-5" /></span><div><h3 className="font-display text-xl font-semibold">Sua presença faz parte desse começo.</h3><p className="mt-1 text-sm text-muted-foreground">Sua motivação: {motivation}</p></div></div>
          <div className="mt-6 border-l-4 border-primary pl-4">
            <p className="text-xs font-bold uppercase text-primary">Abra esse caminho para alguém</p>
            <h3 className="mt-2 font-display text-2xl font-semibold">Quem veio à sua cabeça?</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Tem alguém que você gostaria que conhecesse a Aura? Convide essa pessoa agora para conhecer o que estamos construindo.</p>
          </div>
          <Button className="mt-5 h-auto min-h-12 w-full whitespace-normal py-3" onClick={() => invite("whatsapp")}><MessageCircle className="h-5 w-5 shrink-0" />Convidar pelo WhatsApp</Button>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><Button variant="outline" size="sm" onClick={() => invite("copy")}><Copy className="h-4 w-4" />Copiar convite</Button>{step === "invite" && <Button variant="ghost" size="sm" onClick={() => setStep("return")}>Agora não</Button>}</div>
          <p className="mt-3 text-xs text-muted-foreground">{role === "participant" ? "Para ter seu link individual, escolha participar também como Embaixador." : "Seu convite tem um link individual. O impacto aparece quando alguém realmente chega por ele."}</p>
          {step === "return" && <div className="mt-7 border-t border-border pt-5"><Sprout className="h-6 w-6 text-primary" /><h4 className="mt-3 font-display text-xl font-semibold">Seu lugar nessa história</h4><p className="mt-2 text-sm text-muted-foreground">Sua presença tem valor, mesmo sem indicações. As próximas histórias e novidades reais terão lugar no nosso Mural.</p><p className="mt-3 text-xs text-muted-foreground">Abrir o WhatsApp não confirma um envio nem conta como indicação concluída.</p></div>}
        </>}
        {step === "consent" && <>
          <UsersPreviewHeading />
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Como Embaixador, você pode compartilhar seu link individual e acompanhar as pessoas que chegam por ele. Sem meta ou obrigação de indicar.</p>
          <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm" htmlFor="preview-ambassador-consent"><Checkbox id="preview-ambassador-consent" checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} /><span>Quero participar também como Embaixador e ter meu link de convite.</span></label>
          <Button className="mt-6 w-full" disabled={!consent} onClick={() => { setRole("ambassador"); if (pendingAction === "copy") { setStep("invite"); setNotice("Adesão e cópia simuladas. Nenhum papel ou link real foi alterado."); } else setStep("composer"); }}>Ser Embaixador e preparar convite <ArrowRight className="h-4 w-4" /></Button>
          <Button variant="ghost" className="mt-2 w-full" onClick={() => { setConsent(false); setStep("return"); }}>Continuar só como Participante</Button>
        </>}
        {step === "composer" && <>
          <MessageCircle className="h-7 w-7 text-primary" />
          <h3 className="mt-3 font-display text-2xl font-semibold">Um convite com a sua voz</h3>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Sua experiência com a Aura">
            <Button size="sm" variant={experience === "user" ? "default" : "outline"} aria-pressed={experience === "user"} onClick={() => { setExperience("user"); setMessage(messageFor("user")); }}>Já uso a Aura</Button>
            <Button size="sm" variant={experience === "supporter" ? "default" : "outline"} aria-pressed={experience === "supporter"} onClick={() => { setExperience("supporter"); setMessage(messageFor("supporter")); }}>Ainda não experimentei</Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Escolha a versão que corresponde à sua experiência. Trocar de versão substitui o texto abaixo.</p>
          <label htmlFor="preview-invite-message" className="mt-4 block text-sm font-medium">Mensagem para quem você lembrou</label>
          <Textarea id="preview-invite-message" className="mt-2 min-h-80" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1200} />
          <p className="mt-3 text-xs text-muted-foreground">“Está me fazendo muito bem” deve refletir sua experiência real. O cafezinho se refere à oferta de entrada, não à mensalidade; conferir a oferta do link antes de liberar aos clientes.</p>
          <p className="mt-3 break-all text-xs font-semibold text-primary">Link demonstrativo: olaaura.com.br/movimento?por=seu-link</p>
          <Button className="mt-5 w-full" disabled={!message.trim()} onClick={() => { setStep("return"); setNotice("Abertura do WhatsApp simulada. Nenhuma mensagem foi enviada e nenhum impacto foi registrado."); }}><MessageCircle className="h-4 w-4" />Simular abertura do WhatsApp</Button>
          <Button variant="ghost" className="mt-2 w-full" onClick={() => setStep("invite")}><ArrowLeft className="h-4 w-4" />Voltar ao convite</Button>
        </>}
        {notice && <p role="status" className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">{notice}</p>}
      </div>
    </div>
  </section>;
}

function UsersPreviewHeading() {
  return <><HeartHandshake className="h-7 w-7 text-primary" /><h3 className="mt-3 font-display text-2xl font-semibold">Quer multiplicar essa causa?</h3></>;
}