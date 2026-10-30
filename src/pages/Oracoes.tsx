import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { Check, Copy, CreditCard, Gift, QrCode, HandHeart, HeartHandshake, Loader2, MessageCircleHeart, Moon, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { getFbc, getFbp } from "@/lib/meta-pixel";
import { PrayerShowcase } from "@/components/oracoes/PrayerShowcase";
import { PRAYERS } from "@/lib/prayers";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import "@/styles/v2-theme.css";

// Página de venda do plano Orações e Meditações (sem acompanhamento contínuo com a AURA).
type Offer = "weekly" | "yearly";
type PayMethod = "card" | "pix";

// Mesmo token do checkout principal: libera o App neste aparelho após o PIX.
const getCheckoutAccessToken = (): string => {
  const key = "aura_checkout_access";
  const current = localStorage.getItem(key);
  if (current && /^[a-f0-9]{64}$/i.test(current)) return current;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(key, token);
  return token;
};

const maskCpf = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

const OFFERS: { id: Offer; label: string; price: string; unit: string; note: string; featured?: boolean }[] = [
  { id: "weekly", label: "Experimente 7 dias", price: "6,90", unit: "por 7 dias", note: "Depois R$ 16,90/mês. Cancele quando quiser." },
  { id: "yearly", label: "Anual", price: "11,90", unit: "/mês", note: "R$ 142,80 por ano. Renova uma vez por ano.", featured: true },
];

const pillars = [
  { icon: MessageCircleHeart, title: "Palavras para quando faltam palavras", body: "Você não precisa estar inspirada nem forte. Dê o play: a oração dá nome ao que está pesando — o cansaço, o medo, a culpa, a sensação de carregar tudo sozinha." },
  { icon: HandHeart, title: "Venha como você está", body: "Sem performance de fé. Um espaço honesto para dizer “Deus, hoje estou sem forças” e ser acolhida assim mesmo." },
  { icon: HeartHandshake, title: "A AURA ora com você", body: "Ela não prega nem fala em nome de Deus. Fica ao seu lado, com voz calma, e conduz você ao silêncio com Ele." },
  { icon: Moon, title: "Descanso para a alma e para a mente", body: "Cuidado com as emoções reais do dia a dia unido à paz de entregar a Deus o que você não consegue resolver. “O dia terminou. O Teu cuidado, não.”" },
];

const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const scrollToForm = () => document.getElementById("assinar")?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function Oracoes() {
  const [offer, setOffer] = useState<Offer>("weekly");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<PayMethod>("pix");
  const [cpf, setCpf] = useState("");
  const [pix, setPix] = useState<{ qr: string; code: string; amount: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  // Aguarda a confirmação do PIX e abre o App já autenticado.
  useEffect(() => {
    if (!pix) return;
    const token = getCheckoutAccessToken();
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      attempts += 1;
      try {
        const status = await supabase.functions.invoke("checkout-app-access", { body: { action: "status", token } });
        if (cancelled) return;
        if (status.data?.paid) {
          const consumed = await supabase.functions.invoke("checkout-app-access", { body: { action: "consume", token } });
          if (cancelled) return;
          if (consumed.data?.token_hash) {
            const v = await supabasePortal.auth.verifyOtp({ token_hash: consumed.data.token_hash, type: consumed.data.type || "magiclink" });
            if (!v.error) {
              localStorage.removeItem("aura_checkout_access");
              navigate("/meu-espaco?tab=oracoes", { replace: true });
              return;
            }
          }
          navigate("/obrigado", { replace: true });
          return;
        }
      } catch { /* segue tentando */ }
      if (!cancelled && attempts < 200) timer = setTimeout(check, 3000);
    };
    timer = setTimeout(check, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pix, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const digits = phone.replace(/\D/g, "");
    if (name.trim().length < 2) return setError("Digite seu nome.");
    if (digits.length < 10) return setError("Digite um WhatsApp válido com DDD.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Digite um e-mail válido.");
    if (method === "pix") {
      const c = cpf.replace(/\D/g, "");
      if (c.length !== 11) return setError("Digite um CPF válido.");
      setLoading(true);
      const { data, error: fnError } = await supabase.functions.invoke("criar-pix-recorrente-woovi", {
        body: {
          plan: "oracoes",
          billing: offer === "yearly" ? "yearly" : "monthly",
          ...(offer === "weekly" ? { trial: true } : {}),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: `55${digits}`,
          cpf: c,
          accessToken: getCheckoutAccessToken(),
          fbp: getFbp(),
          fbc: getFbc(),
        },
      });
      setLoading(false);
      if (data?.blocked || data?.code) return setError(data?.message || "Já existe uma assinatura ativa com esses dados.");
      if (fnError || !data?.qrCodeImage || !data?.copyPaste) {
        return setError(data?.error || "Não conseguimos gerar o PIX agora. Tente novamente em instantes.");
      }
      setPix({ qr: data.qrCodeImage, code: data.copyPaste, amount: Number(data.amount) || 0 });
      return;
    }
    setLoading(true);
    const { data, error: fnError } = await supabase.functions.invoke("create-checkout", {
      body: {
        plan: "oracoes",
        billing: offer === "yearly" ? "yearly" : "monthly",
        trial: offer === "weekly",
        paymentMethod: "card",
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: `55${digits}`,
        fbp: getFbp(),
        fbc: getFbc(),
        source: "oracoes",
      },
    });
    setLoading(false);
    if (fnError || !data?.url) {
      setError(data?.error || "Não conseguimos abrir o pagamento agora. Tente novamente em instantes.");
      return;
    }
    window.location.href = data.url;
  };


  return (
    <div className="theme-v2 deg-hero-bg min-h-dvh bg-background text-foreground">
      <Helmet>
        <title>Oração para dormir em paz e oração da noite guiada | Olá Aura</title>
        <meta name="description" content="Ouça orações guiadas para a noite, para dormir em paz e para começar o dia, com voz acolhedora. Experimente 7 dias por R$ 6,90." />
        <link rel="canonical" href="https://olaaura.com.br/oracoes" />
        <meta property="og:title" content="Orações guiadas para a noite e para dormir em paz | Olá Aura" />
        <meta property="og:description" content="Quando faltam as palavras, você ainda pode orar. Orações narradas para cada momento do seu dia." />
        <meta property="og:url" content="https://olaaura.com.br/oracoes" />
      </Helmet>

      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <img src={logoOlaAura} alt="Olá Aura" className="h-14 w-auto md:h-16" />
        <Link to="/meu-espaco/entrar" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Já tenho acesso</Link>
      </header>

      <main className="container mx-auto grid max-w-6xl grid-cols-1 gap-10 overflow-x-hidden px-6 pb-16 pt-4 md:grid-cols-[1fr_1.05fr] md:items-center md:pt-10">
        <section className="min-w-0">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-primary">Orações guiadas · 7 dias por R$ 6,90</p>
          <h1 className="font-display text-4xl font-medium leading-[1.08] tracking-tight md:text-6xl">
            Quando faltam as palavras, você ainda pode orar.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-foreground/75">
            Você não precisa de uma pregação longa nem de palavras bonitas quando está exausta. Precisa de alguns minutos de silêncio e entrega com Deus — e a AURA ora com você.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button size="lg" onClick={() => document.getElementById("ouvir")?.scrollIntoView({ behavior: "smooth" })}>Ouvir uma oração agora</Button>
            <button onClick={scrollToForm} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">Começar por R$ 6,90</button>
          </div>
        </section>
        <div id="ouvir" className="min-w-0 scroll-mt-6"><PrayerShowcase onSubscribe={() => { setOffer("weekly"); document.getElementById("assinar")?.scrollIntoView({ behavior: "smooth" }); }} /></div>
      </main>

      <section className="border-y border-border bg-card/60">
        <div className="container mx-auto max-w-3xl px-6 py-14 text-center">
          <p className="font-display text-2xl italic leading-snug md:text-3xl">“Deus, hoje eu estou sem forças. Mas eu estou aqui.”</p>
          <p className="mt-4 text-foreground/70">É assim que muitas orações da AURA começam: do jeito que você chega, sem precisar parecer forte.</p>
        </div>
      </section>

      <section className="container mx-auto max-w-6xl px-6 py-16">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Por que é diferente</span>
        <h2 className="mt-1 font-display text-2xl font-medium md:text-3xl">Uma oração que fala a sua língua</h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {pillars.map((p) => (
            <li key={p.title} className="rounded-xl border border-border bg-card p-6">
              <p.icon className="h-5 w-5 text-primary" />
              <p className="mt-3 font-display text-lg font-medium">{p.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/75">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="container mx-auto max-w-6xl px-6 pb-16">
        <h2 className="font-display text-2xl font-medium md:text-3xl">Um acervo de orações para cada momento</h2>
        <p className="mt-2 text-foreground/70">São várias orações guiadas com a voz da AURA, organizadas pelo que você está vivendo.</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {["Noite e insônia", "Manhã e direção", "Cansaço e sobrecarga", "Força e coragem", "Família e gratidão", "Esperança e confiança"].map((t) => (
            <li key={t} className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/80">{t}</li>
          ))}
        </ul>
        <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {PRAYERS.slice(0, 8).map((p) => (
            <li key={p.id} className="relative isolate aspect-[4/5] overflow-hidden rounded-2xl">
              <img src={p.image} alt={p.imageAlt} loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover" />
              <div className="preview-shade absolute inset-0 -z-10" aria-hidden="true" />
              <div className="preview-copy flex h-full flex-col justify-end p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{p.category}</p>
                <p className="mt-1 font-display text-base font-medium leading-tight">{p.title}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">E o acervo segue crescendo, com novas orações e meditações guiadas para desacelerar o corpo e respirar de novo.</p>
      </section>

      <section className="container mx-auto max-w-3xl px-6 pb-10">
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 md:p-8">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary"><Gift className="h-4 w-4" />Presente incluído no seu plano</p>
          <h2 className="mt-2 font-display text-2xl font-medium md:text-3xl">1 encontro de 45 minutos com a AURA</h2>
          <p className="mt-3 text-foreground/75">Além das orações e meditações, quando o peito apertar e você precisar desabafar e organizar os pensamentos, você tem uma conversa profunda de 45 minutos com a AURA no App. Sem custo extra.</p>
        </div>
      </section>

      <section id="assinar" className="container mx-auto max-w-3xl scroll-mt-6 px-6 pb-20">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl md:p-8">
          <h2 className="font-display text-2xl font-medium md:text-3xl">Escolha como começar</h2>
          <div role="radiogroup" aria-label="Escolha do plano" className="mt-6 grid gap-3 sm:grid-cols-2">
            {OFFERS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={offer === o.id}
                onClick={() => setOffer(o.id)}
                className={`relative rounded-xl border p-4 text-left transition-colors ${offer === o.id ? "border-primary bg-primary/5 ring-2 ring-primary" : "border-border hover:border-primary/50"}`}
              >
                {o.featured && <span className="absolute -top-3 left-4 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">Mais vantajoso</span>}
                <p className="text-sm font-semibold">{o.label}</p>
                <p className="mt-1"><span className="text-sm text-foreground/60">R$ </span><span className="font-display text-2xl font-semibold">{o.price}</span><span className="text-sm text-foreground/60"> {o.unit}</span></p>
                <p className="mt-1 text-xs text-muted-foreground">{o.note}</p>
              </button>
            ))}
          </div>

          <ul className="mt-6 space-y-2 text-sm text-foreground/80">
            {["Todas as orações narradas liberadas", "Todas as meditações guiadas liberadas", "1 encontro de 45 minutos com a AURA para conversar, quando quiser", "Sem fidelidade · cancele quando quiser"].map((f) => (
              <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{f}</li>
            ))}
          </ul>

          {pix ? (
            <div className="mt-6 space-y-4 text-center">
              <p className="font-semibold">Pague R$ {pix.amount.toFixed(2).replace(".", ",")} pelo PIX</p>
              <p className="text-sm text-muted-foreground">Abra o app do seu banco, escaneie o QR Code ou use o código abaixo. Ao pagar, autorize o PIX Automático para renovar sem precisar lembrar.</p>
              <img src={pix.qr.startsWith("data:") || pix.qr.startsWith("http") ? pix.qr : `data:image/png;base64,${pix.qr}`} alt="QR Code PIX" className="mx-auto h-56 w-56 rounded-lg bg-background p-2" />
              <Button type="button" variant="outline" className="w-full" onClick={async () => { await navigator.clipboard.writeText(pix.code); setCopied(true); setTimeout(() => setCopied(false), 2500); }}>
                <Copy className="mr-2 h-4 w-4" />{copied ? "Código copiado!" : "Copiar código PIX"}
              </Button>
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Aguardando o pagamento… seu acesso abre sozinho aqui.</p>
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setPix(null)}>Voltar</button>
            </div>
          ) : (
          <>
          <div role="radiogroup" aria-label="Forma de pagamento" className="mt-6 grid grid-cols-2 gap-3">
            {([["pix", "PIX", QrCode], ["card", "Cartão", CreditCard]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" role="radio" aria-checked={method === id} onClick={() => setMethod(id)}
                className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-colors ${method === id ? "border-primary bg-primary/5 ring-2 ring-primary" : "border-border hover:border-primary/50"}`}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div className="space-y-1.5"><Label htmlFor="or-name">Seu nome</Label><Input id="or-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
            <div className="space-y-1.5"><Label htmlFor="or-phone">WhatsApp</Label><Input id="or-phone" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} /></div>
            <div className="space-y-1.5"><Label htmlFor="or-email">E-mail</Label><Input id="or-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} /></div>
            {method === "pix" && <div className="space-y-1.5"><Label htmlFor="or-cpf">CPF</Label><Input id="or-cpf" inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} /></div>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {offer === "weekly" ? "Começar 7 dias por R$ 6,90" : "Assinar plano anual · R$ 142,80"}
            </Button>
          </form>
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /><span>{method === "pix" ? "PIX Automático seguro, autorizado no app do seu banco." : "Pagamento seguro no cartão."} {offer === "weekly" ? "Após 7 dias, renova automaticamente por R$ 16,90/mês." : "Cobrança única de R$ 142,80 por 1 ano de acesso (equivale a R$ 11,90/mês)."}</span></p>
          </>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Quer conversar com a AURA sempre que precisar? Você pode mudar para um plano com acompanhamento a qualquer momento dentro do App.</p>
        </div>
      </section>

      <section className="container mx-auto max-w-3xl px-6 pb-20">
        <h2 className="font-display text-2xl font-medium md:text-3xl">Dúvidas comuns</h2>
        <div className="mt-6 space-y-3">
          {[
            { q: "As orações são de alguma igreja?", a: "Não. São orações cristãs, simples e próximas, que qualquer pessoa que crê em Deus pode acompanhar." },
            { q: "Posso conversar com a AURA?", a: "Seu plano inclui 1 encontro de 45 minutos com a AURA. Para conversar sempre que quiser, é só mudar para um plano com acompanhamento dentro do App." },
            { q: "Como cancelo?", a: "Direto no App, em poucos toques. Sem fidelidade e sem multa." },
            { q: "Preciso baixar algo?", a: "Não. O App abre direto no navegador do celular." },
          ].map((f) => (
            <details key={f.q} className="rounded-xl border border-border bg-card p-5">
              <summary className="cursor-pointer list-none font-semibold">{f.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-foreground/75">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-8 flex justify-center"><Button size="lg" onClick={scrollToForm}>Começar por R$ 6,90</Button></div>
      </section>

      <footer className="border-t border-border bg-card/60">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground">
          <span>© Olá Aura</span>
          <span className="flex gap-4"><Link to="/termos" className="hover:underline">Termos</Link><Link to="/privacidade" className="hover:underline">Privacidade</Link></span>
        </div>
      </footer>
    </div>
  );
}
