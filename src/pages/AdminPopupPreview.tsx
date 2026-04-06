import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Check, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type PlanId = 'essencial' | 'direcao' | 'transformacao';

const plans: Record<PlanId, { name: string; trialPrice: string }> = {
  essencial: { name: 'Essencial', trialPrice: '6,90' },
  direcao: { name: 'Direção', trialPrice: '9,90' },
  transformacao: { name: 'Transformação', trialPrice: '19,90' },
};

export default function AdminPopupPreview() {
  const { isLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('direcao');
  const navigate = useNavigate();

  useEffect(() => {
    redirectIfNotAdmin();
  }, [isLoading, isAdmin]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  const currentPlan = plans[selectedPlan];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/configuracoes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Preview do Popup Exit-Intent</h1>
        </div>

        <div className="flex gap-2 mb-8 justify-center">
          {(Object.keys(plans) as PlanId[]).map((id) => (
            <Button
              key={id}
              variant={selectedPlan === id ? 'sage' : 'outline'}
              size="sm"
              onClick={() => setSelectedPlan(id)}
            >
              {plans[id].name}
            </Button>
          ))}
        </div>

        {/* Popup preview */}
        <div className="flex items-center justify-center">
          <div className="bg-card rounded-2xl p-8 max-w-md w-full shadow-xl border border-border/50 text-center space-y-5">
            <p className="text-4xl">🎁</p>
            <h2 className="font-display text-xl font-semibold text-foreground">
              Espera!
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Sua oferta de trial ainda está ativa: <span className="font-semibold text-primary">7 dias por apenas R$ {currentPlan.trialPrice}</span> (plano {currentPlan.name})
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground text-left mx-auto max-w-xs">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary flex-shrink-0" />
                Garantia de satisfação
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary flex-shrink-0" />
                Cancele quando quiser
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary flex-shrink-0" />
                +500 pessoas já começaram
              </li>
            </ul>
            <Button variant="sage" size="lg" className="w-full">
              Quero experimentar por R$ {currentPlan.trialPrice}
            </Button>
            <a
              href="https://wa.me/5511999999999?text=Oi%2C%20tenho%20uma%20d%C3%BAvida%20sobre%20a%20AURA"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Prefere tirar uma dúvida? Fale conosco
            </a>
            <br />
            <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Não, obrigado
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
