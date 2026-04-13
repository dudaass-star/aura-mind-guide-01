import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles } from "lucide-react";

// ==================== Section Header ====================
export function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 animate-fade-in">
      <Icon size={20} className="text-accent" />
      <h2 className="font-['Fraunces'] text-xl font-semibold text-foreground">{title}</h2>
    </div>
  );
}

// ==================== Metric Card ====================
export function MetricCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="bg-muted/50 rounded-xl p-3 text-center hover:bg-muted/70 hover:shadow-sm transition-all hover:scale-[1.02]">
      <Icon size={18} className="text-accent mx-auto mb-1" />
      <p className="text-xl font-semibold text-foreground font-['Fraunces']">{value}</p>
      <p className="text-xs text-muted-foreground font-['Nunito']">{label}</p>
    </div>
  );
}

// ==================== Empty State ====================
export function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="text-center py-16 space-y-4 animate-fade-in">
      <div className="bg-accent/10 rounded-full p-4 w-16 h-16 mx-auto flex items-center justify-center animate-pulse-soft">
        <Icon size={28} className="text-accent" />
      </div>
      <p className="text-foreground font-['Fraunces'] text-lg font-semibold">{title}</p>
      <p className="text-muted-foreground font-['Nunito'] text-sm max-w-xs mx-auto">{description}</p>
    </div>
  );
}

// ==================== Greeting Helpers ====================
const MOTIVATIONAL_QUOTES = [
  "Cada conversa é um passo na sua jornada interior.",
  "Você está construindo algo bonito, um dia de cada vez.",
  "A transformação começa com a coragem de olhar para dentro.",
  "Seu progresso é real, mesmo nos dias que parecem parados.",
  "Aqui está tudo que já caminhamos juntas.",
  "A mudança mais profunda é silenciosa — e já está acontecendo.",
  "Você merece celebrar cada pequeno avanço.",
  "Cada insight é uma semente plantada no jardim da sua vida.",
];

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function getMotivationalQuote(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length];
}

// ==================== Portal Header ====================
export function PortalHeader({ firstName }: { firstName: string }) {
  const greeting = getGreeting();
  const quote = getMotivationalQuote();

  return (
    <div className="border-b border-border/20">
      <div className="max-w-2xl mx-auto px-5 py-5 animate-fade-in">
        <div className="flex items-center gap-2">
          <p className="text-xl font-medium text-foreground font-['Fraunces']">
            {greeting}, {firstName}
          </p>
          <Sparkles size={18} className="text-accent animate-pulse-soft" />
        </div>
        <p className="text-sm text-muted-foreground font-['Nunito'] mt-1 italic">
          {quote}
        </p>
      </div>
    </div>
  );
}

// ==================== Skeleton Loading ====================
export function PortalLoading() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header skeleton */}
      <div className="bg-card border-b border-border/40">
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
          <Skeleton className="h-12 w-28" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      {/* Greeting skeleton */}
      <div className="border-b border-border/20">
        <div className="max-w-2xl mx-auto px-5 py-5 space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      {/* Tabs skeleton */}
      <div className="border-b border-border/30 bg-card/50">
        <div className="max-w-2xl mx-auto px-5 flex gap-4 py-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-6 w-16" />
          ))}
        </div>
      </div>
      {/* Content skeleton */}
      <div className="max-w-2xl mx-auto w-full px-5 py-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function PortalLoadingInline() {
  return (
    <div className="space-y-4 py-4">
      {[1, 2].map((i) => (
        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
      ))}
    </div>
  );
}

// ==================== Badges ====================
interface BadgeItem {
  label: string;
  icon: React.ElementType;
  color: string;
  earned: boolean;
}

export function ProgressBadges({ journeysCompleted, reportsCount, meditationsAvailable }: {
  journeysCompleted: number;
  reportsCount: number;
  meditationsAvailable: boolean;
}) {
  const badges: BadgeItem[] = [];

  if (journeysCompleted >= 1) {
    badges.push({ label: "Primeira Jornada", icon: Sparkles, color: "bg-accent/15 text-accent", earned: true });
  }
  if (journeysCompleted >= 3) {
    badges.push({ label: "Exploradora", icon: Sparkles, color: "bg-primary/15 text-primary", earned: true });
  }
  if (reportsCount >= 1) {
    badges.push({ label: "Primeiro Mês", icon: Sparkles, color: "bg-accent/15 text-accent", earned: true });
  }
  if (reportsCount >= 3) {
    badges.push({ label: "Consistência", icon: Sparkles, color: "bg-primary/15 text-primary", earned: true });
  }

  if (badges.length === 0) return null;

  return (
    <div className="border-b border-border/20">
      <div className="max-w-2xl mx-auto px-5 py-3">
        <div className="flex gap-2 flex-wrap">
          {badges.map((badge) => {
            const BadgeIcon = badge.icon;
            return (
              <div
                key={badge.label}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium font-['Nunito'] ${badge.color} animate-fade-in`}
              >
                <BadgeIcon size={12} />
                {badge.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
