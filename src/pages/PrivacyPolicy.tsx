import Header from "@/components/Header";
import Footer from "@/components/Footer";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-4xl font-bold text-center mb-8">Política de Privacidade</h1>
          <p className="text-muted-foreground text-center mb-12">
            Última atualização: Janeiro de 2025
          </p>

          <div className="space-y-8 text-foreground/90">
            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Introdução</h2>
              <p className="leading-relaxed">
                A AURA está comprometida em proteger sua privacidade. Esta política descreve como coletamos, 
                usamos e protegemos suas informações pessoais em conformidade com a Lei Geral de Proteção de 
                Dados (LGPD - Lei nº 13.709/2018).
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. Dados Coletados</h2>
              <p className="leading-relaxed mb-4">Coletamos os seguintes tipos de dados:</p>
              <ul className="list-disc list-inside space-y-2 leading-relaxed">
                <li><strong>Dados de identificação:</strong> nome, número de telefone (WhatsApp)</li>
                <li><strong>Dados de uso:</strong> histórico de conversas, preferências de sessão, horários de uso</li>
                <li><strong>Dados de pagamento:</strong> processados de forma segura pelo Stripe (não armazenamos dados de cartão)</li>
                <li><strong>Dados de bem-estar:</strong> informações compartilhadas durante as sessões para personalização do serviço</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. Como Usamos Seus Dados</h2>
              <p className="leading-relaxed mb-4">Utilizamos suas informações para:</p>
              <ul className="list-disc list-inside space-y-2 leading-relaxed">
                <li>Fornecer e personalizar o serviço de autocuidado emocional</li>
                <li>Manter continuidade entre as sessões de conversa</li>
                <li>Enviar lembretes e notificações sobre suas sessões</li>
                <li>Processar pagamentos e gerenciar sua assinatura</li>
                <li>Melhorar nossos serviços e desenvolver novos recursos</li>
                <li>Cumprir obrigações legais e regulatórias</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. Compartilhamento de Dados</h2>
              <p className="leading-relaxed mb-4">
                Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins de marketing. 
                Podemos compartilhar dados apenas nas seguintes situações:
              </p>
              <ul className="list-disc list-inside space-y-2 leading-relaxed">
                <li><strong>Processadores de pagamento:</strong> Stripe, para processar transações</li>
                <li><strong>Provedores de infraestrutura:</strong> serviços de nuvem para hospedagem segura</li>
                <li><strong>Obrigações legais:</strong> quando exigido por lei ou ordem judicial</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Segurança dos Dados</h2>
              <p className="leading-relaxed">
                Implementamos medidas técnicas e organizacionais para proteger seus dados, incluindo:
              </p>
              <ul className="list-disc list-inside space-y-2 leading-relaxed mt-4">
                <li>Criptografia de dados em trânsito e em repouso</li>
                <li>Acesso restrito a dados pessoais</li>
                <li>Monitoramento contínuo de segurança</li>
                <li>Backups regulares e planos de recuperação</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. Seus Direitos (LGPD)</h2>
              <p className="leading-relaxed mb-4">
                Conforme a LGPD, você tem os seguintes direitos:
              </p>
              <ul className="list-disc list-inside space-y-2 leading-relaxed">
                <li><strong>Acesso:</strong> solicitar cópia dos seus dados pessoais</li>
                <li><strong>Correção:</strong> solicitar correção de dados incompletos ou incorretos</li>
                <li><strong>Exclusão:</strong> solicitar a eliminação dos seus dados</li>
                <li><strong>Portabilidade:</strong> receber seus dados em formato estruturado</li>
                <li><strong>Revogação:</strong> revogar o consentimento a qualquer momento</li>
                <li><strong>Informação:</strong> saber com quem seus dados são compartilhados</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">7. Retenção de Dados</h2>
              <p className="leading-relaxed">
                Mantemos seus dados enquanto sua conta estiver ativa ou conforme necessário para fornecer 
                nossos serviços. Após o cancelamento, seus dados serão retidos por até 30 dias para fins 
                de backup, após os quais serão excluídos permanentemente, a menos que a retenção seja 
                exigida por lei.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">8. Cookies e Tecnologias Similares</h2>
              <p className="leading-relaxed">
                Utilizamos cookies e tecnologias similares para melhorar sua experiência, analisar o uso 
                do site e personalizar conteúdo. Você pode gerenciar suas preferências de cookies através 
                das configurações do seu navegador.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">9. Alterações nesta Política</h2>
              <p className="leading-relaxed">
                Podemos atualizar esta política periodicamente. Notificaremos você sobre alterações 
                significativas por e-mail ou através do serviço. Recomendamos revisar esta política 
                regularmente.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">10. Contato</h2>
              <p className="leading-relaxed">
                Para exercer seus direitos ou esclarecer dúvidas sobre esta política, entre em contato 
                com nosso Encarregado de Proteção de Dados através do e-mail{" "}
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

export default PrivacyPolicy;
