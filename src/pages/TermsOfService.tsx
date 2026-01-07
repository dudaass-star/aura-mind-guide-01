import Header from "@/components/Header";
import Footer from "@/components/Footer";

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-4xl font-bold text-center mb-8">Termos de Uso</h1>
          <p className="text-muted-foreground text-center mb-12">
            Última atualização: Janeiro de 2025
          </p>

          <div className="space-y-8 text-foreground/90">
            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Aceitação dos Termos</h2>
              <p className="leading-relaxed">
                Ao acessar e utilizar o serviço AURA, você concorda em cumprir e estar vinculado a estes Termos de Uso. 
                Se você não concordar com qualquer parte destes termos, não poderá acessar o serviço.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. Descrição do Serviço</h2>
              <p className="leading-relaxed">
                A AURA é uma assistente de autocuidado emocional baseada em inteligência artificial, disponível via WhatsApp. 
                O serviço oferece suporte emocional, técnicas de bem-estar e acompanhamento personalizado através de sessões 
                de conversa estruturadas.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. Limitações do Serviço</h2>
              <p className="leading-relaxed mb-4">
                <strong>IMPORTANTE:</strong> A AURA NÃO substitui atendimento psicológico, psiquiátrico ou qualquer 
                outro tipo de acompanhamento profissional de saúde mental.
              </p>
              <p className="leading-relaxed">
                Em casos de emergência, crise ou pensamentos suicidas, procure imediatamente ajuda profissional 
                ou ligue para o CVV (Centro de Valorização da Vida) no número 188.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. Responsabilidades do Usuário</h2>
              <ul className="list-disc list-inside space-y-2 leading-relaxed">
                <li>Fornecer informações verdadeiras durante o cadastro</li>
                <li>Manter a confidencialidade de suas credenciais de acesso</li>
                <li>Utilizar o serviço de forma ética e respeitosa</li>
                <li>Não compartilhar conteúdo ilegal, ofensivo ou prejudicial</li>
                <li>Buscar ajuda profissional quando necessário</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Assinatura e Pagamento</h2>
              <p className="leading-relaxed mb-4">
                O serviço AURA funciona por meio de assinatura mensal recorrente. O pagamento é processado 
                automaticamente a cada ciclo de cobrança através do Stripe, nossa plataforma de pagamentos segura.
              </p>
              <p className="leading-relaxed">
                Você pode cancelar sua assinatura a qualquer momento. O acesso continuará disponível até o 
                final do período já pago.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. Cancelamento e Reembolso</h2>
              <p className="leading-relaxed">
                Você pode cancelar sua assinatura a qualquer momento através do link disponível no rodapé do site 
                ou entrando em contato com nosso suporte. Não oferecemos reembolso por períodos parciais, mas você 
                manterá acesso ao serviço até o fim do ciclo de cobrança atual.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">7. Propriedade Intelectual</h2>
              <p className="leading-relaxed">
                Todo o conteúdo, marca, design e tecnologia da AURA são de propriedade exclusiva da empresa. 
                É proibida a reprodução, distribuição ou modificação sem autorização prévia por escrito.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">8. Alterações nos Termos</h2>
              <p className="leading-relaxed">
                Reservamo-nos o direito de modificar estes termos a qualquer momento. As alterações serão 
                comunicadas por e-mail ou através do próprio serviço. O uso continuado após as alterações 
                constitui aceitação dos novos termos.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">9. Contato</h2>
              <p className="leading-relaxed">
                Para dúvidas sobre estes Termos de Uso, entre em contato conosco através do e-mail{" "}
                <a href="mailto:suporte@aura.app" className="text-primary hover:underline">
                  suporte@aura.app
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default TermsOfService;
