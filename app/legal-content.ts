export type LegalKind = "terms" | "privacy" | "cookies" | "returns";

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDocument = {
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
};

const business = {
  legalName: "Veronica Reis",
  tradeName: "Mystic Essence - Perfumaria Árabe",
  taxId: "238368734",
  address: "Rua de São Nicolau, n.º 8, loja 20, 4520-248 Santa Maria da Feira, Portugal",
  email: "mystic.essence@hotmail.com",
  phone: "+351 938 258 798",
  site: "https://mysticessence.pt",
};

export const LEGAL_DOCUMENTS: Record<LegalKind, LegalDocument> = {
  terms: {
    eyebrow: "Informação legal",
    title: "Termos e Condições",
    updated: "24 de agosto de 2026",
    intro: "Estes Termos e Condições regulam a utilização da loja online Mystic Essence e as compras realizadas por consumidores finais.",
    sections: [
      {
        title: "1. Identificação do vendedor",
        paragraphs: [
          `O vendedor e operador da loja online é ${business.legalName}, que utiliza o nome comercial ${business.tradeName}, NIF ${business.taxId}, com morada em ${business.address}.`,
          `Contactos: ${business.email}, ${business.phone}. Sítio oficial: ${business.site}.`,
        ],
      },
      {
        title: "2. Objeto e âmbito",
        paragraphs: [
          "A Mystic Essence comercializa perfumes, óleos perfumados, ambientadores, decants e outros produtos relacionados com fragrâncias. Estes termos aplicam-se a consumidores, isto é, pessoas singulares que compram para fins não profissionais.",
          "Ao realizar uma encomenda, o cliente declara que leu e aceitou estes termos. A versão aplicável é a que estiver disponível na data da compra.",
        ],
      },
      {
        title: "3. Capacidade e conta de cliente",
        paragraphs: [
          "As compras destinam-se a pessoas com capacidade legal para contratar. Os menores de 18 anos devem atuar através do respetivo representante legal ou com a sua autorização.",
          "Ao criar uma conta, o cliente deve fornecer dados verdadeiros e manter as credenciais confidenciais. A Mystic Essence pode suspender contas em caso de fraude, utilização abusiva ou risco de segurança, sem limitar os direitos legais do cliente.",
        ],
      },
      {
        title: "4. Produtos e informação olfativa",
        paragraphs: [
          "As características essenciais, marca, volume, preço e disponibilidade são apresentadas na página de cada produto. As fotografias procuram representar os artigos fielmente, mas podem existir diferenças de apresentação ou embalagem introduzidas pelo fabricante.",
          "A descrição olfativa é indicativa. A perceção, projeção e duração de uma fragrância variam com a pele, o ambiente, a conservação e a sensibilidade individual. Isto não afasta os direitos relativos a produtos que não correspondam ao contrato.",
          "O cliente deve respeitar as instruções, advertências e lista de ingredientes do fabricante, sobretudo em caso de alergia ou sensibilidade conhecida.",
        ],
      },
      {
        title: "5. Disponibilidade e stock",
        paragraphs: [
          "As encomendas dependem da disponibilidade. Colocar um produto no carrinho não reserva stock. Se surgir uma indisponibilidade depois da encomenda, o cliente será informado sem demora e poderá receber o reembolso do artigo, aceitar uma substituição expressamente acordada ou cancelar a encomenda quando a indisponibilidade seja relevante.",
        ],
      },
      {
        title: "6. Preços, promoções e portes",
        paragraphs: [
          "Os preços são apresentados em euros e incluem IVA à taxa legal em vigor. Antes da confirmação são mostrados o preço dos produtos, descontos, impostos, portes e o total.",
          "Os preços podem ser alterados sem afetar encomendas já confirmadas, exceto em caso de erro manifesto. Códigos e promoções obedecem às condições e prazos apresentados e, salvo indicação em contrário, não são acumuláveis nem convertíveis em dinheiro.",
          "Os portes e o limiar de envio gratuito aplicáveis são os apresentados no checkout. Atualmente, o envio normal para Portugal Continental é gratuito em compras de valor igual ou superior a 85 €.",
        ],
      },
      {
        title: "7. Encomenda e celebração do contrato",
        bullets: [
          "Selecionar produtos, variantes e quantidades e rever o carrinho.",
          "Fornecer dados de contacto, faturação e entrega verdadeiros e completos.",
          "Escolher o método de pagamento e rever o preço total.",
          "Ler e aceitar estes Termos e Condições e confirmar a encomenda através do botão que indica a obrigação de pagamento.",
        ],
        paragraphs: [
          "O cliente pode corrigir erros antes de confirmar. A receção do pedido é comunicada por email. O contrato considera-se aceite quando a Mystic Essence confirmar a encomenda ou a expedição, consoante o que ocorrer primeiro.",
        ],
      },
      {
        title: "8. Pagamento e faturação",
        paragraphs: [
          "Os métodos efetivamente disponíveis são sempre os apresentados no checkout e podem incluir MB WAY, Multibanco ou cartão. O pagamento pode ser processado por um prestador externo; a Mystic Essence não recebe os dados completos do cartão.",
          "A encomenda só avança depois da confirmação necessária do pagamento. O cliente deve fornecer os dados de faturação antes de concluir a compra. A fatura será emitida com esses dados e enviada ou disponibilizada eletronicamente nos termos legais.",
        ],
      },
      {
        title: "9. Recusa ou cancelamento",
        paragraphs: [
          "A Mystic Essence pode recusar ou cancelar uma encomenda por indisponibilidade, pagamento não confirmado, dados incorretos, suspeita fundamentada de fraude, impossibilidade de entrega ou erro manifesto. Se já existir pagamento, o valor devido será reembolsado sem demora injustificada.",
        ],
      },
      {
        title: "10. Entrega",
        paragraphs: [
          "As zonas, transportadoras, custos e prazos estimados são apresentados antes da compra. Salvo acordo diferente, a encomenda será cumprida sem demora injustificada e no prazo máximo legal de 30 dias.",
          "O cliente deve indicar uma morada completa e garantir a receção ou levantamento. Uma nova expedição causada por morada incorreta, ausência reiterada ou falta de levantamento pode depender do pagamento dos custos adicionais razoáveis previamente comunicados.",
        ],
      },
      {
        title: "11. Receção e danos de transporte",
        paragraphs: [
          "Recomenda-se verificar a embalagem à entrega. Em caso de dano visível, fotografe a embalagem, registe a ocorrência junto da transportadora e contacte-nos. Esta recomendação não elimina os direitos legais do consumidor.",
          `Se receber um produto errado, danificado, incompleto ou com derrame, não o utilize e contacte ${business.email}, indicando o número da encomenda e juntando fotografias quando possível.`,
        ],
      },
      {
        title: "12. Livre resolução em 14 dias",
        paragraphs: [
          "O consumidor pode resolver o contrato sem indicar motivo no prazo de 14 dias consecutivos, contado, em regra, desde o dia em que recebe o produto. Quando uma encomenda é entregue em partes, o prazo conta-se da receção do último bem.",
          `A decisão deve ser comunicada de forma inequívoca para ${business.email} ou para ${business.address}, antes do fim do prazo. A utilização de um formulário legal de livre resolução é facultativa.`,
        ],
      },
      {
        title: "13. Devolução e reembolso",
        paragraphs: [
          `Depois de comunicar a livre resolução, o consumidor dispõe de 14 dias para devolver o produto para ${business.address}. Os custos diretos da devolução por mera desistência são suportados pelo consumidor. Não são aceites envios à cobrança sem acordo prévio.`,
          "O reembolso inclui os pagamentos recebidos e, quando o contrato é resolvido na totalidade, o custo da modalidade normal de entrega. É realizado pelo mesmo meio de pagamento, salvo acordo em contrário, e pode ser retido até à receção dos bens ou prova do envio.",
          "O consumidor responde apenas pela depreciação resultante de uma manipulação superior à necessária para verificar a natureza, características e funcionamento do artigo.",
        ],
      },
      {
        title: "14. Exceções à livre resolução",
        paragraphs: [
          "Aplicam-se as exceções previstas na lei, incluindo bens selados não suscetíveis de devolução por motivos de saúde ou higiene quando o selo relevante tenha sido retirado depois da entrega, e produtos personalizados. A abertura da embalagem exterior de transporte não elimina este direito.",
          "Estas exceções nunca limitam os direitos relativos a produtos errados, danificados, defeituosos ou não conformes.",
        ],
      },
      {
        title: "15. Conformidade e garantia legal",
        paragraphs: [
          "Os produtos beneficiam da garantia legal de conformidade. Em regra, o vendedor é responsável pelas faltas de conformidade que se manifestem no prazo de três anos a contar da entrega. O consumidor pode ter direito à reparação ou substituição, redução proporcional do preço ou resolução do contrato, nos termos e pela ordem previstos na lei.",
          "A reposição da conformidade é gratuita. Danos causados por utilização contrária às instruções, acidente, conservação inadequada ou alteração não autorizada não constituem falta de conformidade imputável à Mystic Essence.",
        ],
      },
      {
        title: "16. Reclamações e resolução de litígios",
        paragraphs: [
          `As reclamações podem ser enviadas para ${business.email}, ${business.phone} ou ${business.address}.`,
          "O Livro de Reclamações Eletrónico está disponível em www.livroreclamacoes.pt. O consumidor pode ainda recorrer ao CICAP - Centro de Informação de Consumo e Arbitragem do Porto, em www.cicap.pt, quando este seja territorial e materialmente competente, ou consultar a lista atualizada em www.consumidor.gov.pt.",
        ],
      },
      {
        title: "17. Propriedade intelectual, responsabilidade e lei aplicável",
        paragraphs: [
          "Os conteúdos, marcas, fotografias e elementos gráficos do site estão protegidos e não podem ser reproduzidos para fins comerciais sem autorização. A Mystic Essence pode suspender temporariamente o site por manutenção, segurança ou força maior.",
          "Aplica-se a lei portuguesa, sem prejuízo das normas imperativas de proteção do consumidor e do direito de recorrer aos tribunais competentes.",
        ],
      },
      {
        title: "18. Contactos e alterações",
        paragraphs: [
          `Questões sobre estes termos podem ser enviadas para ${business.email}. As alterações serão publicadas no site com nova data de atualização e não afetam direitos já constituídos.`,
        ],
      },
    ],
  },
  privacy: {
    eyebrow: "Proteção de dados",
    title: "Política de Privacidade",
    updated: "24 de agosto de 2026",
    intro: "Esta política explica como a Mystic Essence recolhe e trata dados pessoais através da loja, das contas de cliente e dos canais de apoio.",
    sections: [
      {
        title: "1. Responsável pelo tratamento",
        paragraphs: [
          `O responsável pelo tratamento é ${business.legalName}, que utiliza o nome comercial ${business.tradeName}, NIF ${business.taxId}, com morada em ${business.address}. Contactos: ${business.email} e ${business.phone}.`,
        ],
      },
      {
        title: "2. Dados que tratamos",
        bullets: [
          "Identificação e contacto: nome, email, telefone, NIF e moradas.",
          "Conta: identificador, credenciais protegidas, preferências e favoritos.",
          "Encomendas: produtos, quantidades, preços, descontos, estado, entrega, devoluções e reclamações.",
          "Pagamento: método, referência, montante e estado; não recebemos os dados completos do cartão.",
          "Comunicações: mensagens de apoio, email, WhatsApp e redes sociais.",
          "Dados técnicos e de segurança: IP, navegador, dispositivo, data, registos de autenticação e diagnóstico.",
        ],
        paragraphs: ["Não solicitamos categorias especiais de dados. Evite enviar informação de saúde ou outros dados sensíveis em campos livres."],
      },
      {
        title: "3. Como recolhemos os dados",
        paragraphs: [
          "Recolhemos dados diretamente quando cria uma conta, realiza uma encomenda, pede apoio ou envia uma avaliação. Também podemos recebê-los de prestadores de pagamento, transportadoras, autenticação e infraestrutura, na medida necessária ao serviço.",
        ],
      },
      {
        title: "4. Finalidades e fundamentos",
        bullets: [
          "Processar encomendas, pagamentos, entregas, devoluções e apoio: execução do contrato.",
          "Emitir faturas e manter registos fiscais e contabilísticos: obrigação legal.",
          "Criar e gerir contas, favoritos e histórico: execução do contrato.",
          "Prevenir fraude, proteger a loja e defender direitos: interesse legítimo e, quando aplicável, obrigação legal.",
          "Enviar marketing ou usar ferramentas opcionais de medição: consentimento, quando exigido.",
          "Responder a autoridades e cumprir deveres legais: obrigação legal.",
        ],
      },
      {
        title: "5. Dados obrigatórios",
        paragraphs: [
          "Os campos identificados como obrigatórios são necessários para criar a conta, concluir a encomenda, entregar os produtos, emitir documentos fiscais ou responder ao pedido. Sem esses dados poderemos não conseguir prestar o serviço.",
        ],
      },
      {
        title: "6. Pagamentos",
        paragraphs: [
          "Quando os pagamentos estiverem ativos, serão processados pelo prestador apresentado no checkout, que poderá atuar como responsável autónomo. A Mystic Essence recebe apenas os dados necessários para confirmar e reconciliar a transação. Consulte também a política do prestador escolhido.",
        ],
      },
      {
        title: "7. Prestadores e destinatários",
        paragraphs: [
          "Partilhamos apenas os dados necessários com fornecedores que suportam a operação da loja: Netlify, para alojamento e distribuição do site; Google Firebase, para autenticação, base de dados, armazenamento, funções e notificações; prestadores de email; prestadores de pagamento quando ativos; transportadoras; contabilidade e autoridades quando exigido por lei.",
          "Os links para Instagram, TikTok e WhatsApp levam a plataformas externas, que tratam dados segundo as suas próprias políticas. A Mystic Essence não vende dados pessoais.",
        ],
      },
      {
        title: "8. Transferências internacionais",
        paragraphs: [
          "Alguns fornecedores globais podem tratar dados fora do Espaço Económico Europeu. Nessas situações são utilizados mecanismos legalmente admitidos, como decisões de adequação, cláusulas contratuais-tipo e medidas complementares adequadas.",
        ],
      },
      {
        title: "9. Conservação",
        bullets: [
          "Encomendas e faturação: durante a relação contratual e pelos prazos fiscais, contabilísticos e de defesa de direitos aplicáveis.",
          "Conta de cliente: enquanto estiver ativa e pelo tempo necessário a obrigações ou litígios.",
          "Apoio, devoluções e garantias: pelo período necessário à resolução e aos prazos legais aplicáveis.",
          "Marketing: até retirar o consentimento ou exercer oposição.",
          "Registos de segurança: apenas durante o período necessário à prevenção e investigação de incidentes.",
          "Preferência de cookies: 180 dias, salvo eliminação pelo utilizador ou alteração relevante desta política.",
        ],
      },
      {
        title: "10. Marketing",
        paragraphs: [
          `Só enviaremos comunicações promocionais quando exista uma base legal adequada. Pode cancelar a subscrição a qualquer momento através do mecanismo incluído na mensagem ou contactando ${business.email}. Isto não afeta emails necessários à encomenda ou à segurança da conta.`,
        ],
      },
      {
        title: "11. Segurança",
        paragraphs: [
          "Aplicamos controlo de acessos, autenticação, cifragem em trânsito, regras de acesso à base de dados, cópias de segurança e minimização de dados. Nenhum sistema elimina todos os riscos; utilize uma palavra-passe única e avise-nos se suspeitar de acesso indevido.",
        ],
      },
      {
        title: "12. Os seus direitos",
        bullets: [
          "Aceder aos dados e obter informação sobre o tratamento.",
          "Retificar dados inexatos ou incompletos.",
          "Solicitar o apagamento ou a limitação, quando se verifiquem os requisitos legais.",
          "Opor-se a tratamentos baseados em interesse legítimo e sempre ao marketing direto.",
          "Receber os dados abrangidos pelo direito à portabilidade.",
          "Retirar o consentimento sem afetar o tratamento anteriormente realizado.",
          "Não ficar sujeito a decisões exclusivamente automatizadas nos casos previstos na lei.",
        ],
        paragraphs: [
          `Para exercer os seus direitos, contacte ${business.email} ou escreva para ${business.address}. Poderemos pedir informação estritamente necessária para confirmar a identidade. Respondemos, em regra, no prazo de um mês, prorrogável nos termos do RGPD.`,
          "Pode apresentar reclamação à Comissão Nacional de Proteção de Dados, em www.cnpd.pt, sem prejuízo de outros meios administrativos ou judiciais.",
        ],
      },
      {
        title: "13. Menores, ligações externas e alterações",
        paragraphs: [
          "A loja não se dirige autonomamente a menores sem capacidade para contratar. Não somos responsáveis pelas práticas de privacidade de sites externos ligados a partir da loja.",
          "Esta política pode ser atualizada por alterações legais, técnicas ou operacionais. A versão em vigor será publicada nesta página com a respetiva data.",
        ],
      },
      {
        title: "14. Contacto",
        paragraphs: [`Questões de privacidade podem ser enviadas para ${business.email} ou para ${business.address}.`],
      },
    ],
  },
  cookies: {
    eyebrow: "Preferências de navegação",
    title: "Política de Cookies",
    updated: "24 de agosto de 2026",
    intro: "Esta política descreve o armazenamento local e as tecnologias semelhantes utilizadas em mysticessence.pt.",
    sections: [
      {
        title: "1. O que são cookies",
        paragraphs: [
          "Cookies e tecnologias semelhantes são pequenos registos guardados no navegador ou dispositivo. Podem manter uma sessão iniciada, guardar uma escolha ou ajudar a proteger e operar um serviço.",
        ],
      },
      {
        title: "2. O que utilizamos atualmente",
        bullets: [
          "mystic-cookie-consent-v1, Mystic Essence: guarda no armazenamento local a escolha de cookies durante 180 dias. Categoria necessária.",
          "Firebase Authentication, Google: mantém a sessão da conta e elementos de segurança no navegador enquanto o utilizador estiver autenticado. Categoria necessária/funcional, com duração dependente da sessão e das definições da conta.",
          "Armazenamento técnico do navegador e registos de segurança, Netlify e Firebase: necessários para entregar e proteger o site e os serviços solicitados.",
        ],
        paragraphs: [
          "Nesta data, o site não utiliza Google Analytics, Meta Pixel, TikTok Pixel nem cookies publicitários próprios. Os links externos não instalam cookies dessas plataformas antes de o utilizador os abrir.",
        ],
      },
      {
        title: "3. Categorias",
        paragraphs: [
          "As tecnologias estritamente necessárias permitem autenticação, segurança, formulários, encomendas e a conservação da escolha de cookies. Não dependem de consentimento quando forem indispensáveis ao serviço solicitado.",
          "Cookies de preferências, analítica, publicidade ou conteúdo externo não essencial só serão ativados após consentimento, caso essas funcionalidades sejam adicionadas no futuro.",
        ],
      },
      {
        title: "4. Aceitar, rejeitar ou alterar",
        paragraphs: [
          "Na primeira visita pode aceitar ou rejeitar cookies opcionais. As duas opções têm o mesmo destaque e a navegação continua disponível se rejeitar. Como não existem atualmente ferramentas opcionais de analítica ou publicidade, ambas as escolhas mantêm apenas o armazenamento necessário.",
          "Pode retirar ou alterar a escolha a qualquer momento através de “Gerir cookies” no rodapé. A ausência de resposta ou a continuação da navegação não são tratadas como consentimento.",
        ],
      },
      {
        title: "5. Definições do navegador",
        paragraphs: [
          "Também pode bloquear ou eliminar cookies e armazenamento local nas definições do Chrome, Firefox, Edge ou Safari. O bloqueio de tecnologias necessárias pode impedir o início de sessão, formulários, encomendas ou outras funções solicitadas.",
        ],
      },
      {
        title: "6. Serviços externos",
        paragraphs: [
          "Ao seguir uma ligação para WhatsApp, Instagram, TikTok, Google ou para o prestador de pagamentos, passa a usar um serviço externo, que poderá instalar as suas próprias tecnologias segundo a respetiva política.",
        ],
      },
      {
        title: "7. Transferências e proteção de dados",
        paragraphs: [
          "Alguns fornecedores globais podem tratar identificadores técnicos fora do Espaço Económico Europeu com mecanismos legalmente adequados. Consulte a Política de Privacidade para informação sobre destinatários, direitos e contactos.",
        ],
      },
      {
        title: "8. Atualizações e contacto",
        paragraphs: [
          `A tabela e esta política serão atualizadas se forem adicionadas novas ferramentas. Alterações relevantes podem originar um novo pedido de consentimento. Questões podem ser enviadas para ${business.email}.`,
        ],
      },
    ],
  },
  returns: {
    eyebrow: "Compras online",
    title: "Devoluções e Reembolsos",
    updated: "24 de agosto de 2026",
    intro: "Esta política explica a livre resolução, as devoluções e os direitos relativos a produtos errados, danificados ou não conformes.",
    sections: [
      {
        title: "1. Âmbito e contactos",
        paragraphs: [
          `Aplica-se às compras realizadas em ${business.site} por consumidores finais. O vendedor é ${business.legalName}, ${business.tradeName}, NIF ${business.taxId}. Pedidos: ${business.email}, ${business.phone} ou ${business.address}.`,
        ],
      },
      {
        title: "2. Direito de livre resolução",
        paragraphs: [
          "O consumidor pode desistir da compra online sem indicar motivo no prazo de 14 dias consecutivos, contado, em regra, desde o dia em que recebe o produto. Se os produtos forem entregues separadamente, o prazo começa na receção do último.",
          `A decisão deve ser comunicada de forma inequívoca por email para ${business.email} ou por correio para ${business.address}. O formulário legal de livre resolução é facultativo.`,
        ],
      },
      {
        title: "3. Como devolver",
        paragraphs: [
          `Depois da comunicação, envie ou entregue os produtos em ${business.address} no prazo máximo de 14 dias. Contacte-nos primeiro, indicando nome, número da encomenda, produto e data de receção.`,
          "Embale o artigo com segurança e guarde o comprovativo de envio. Sempre que possível, inclua embalagem comercial, acessórios, ofertas e restantes elementos recebidos. A falta da embalagem comercial não elimina automaticamente o direito, mas uma depreciação efetiva pode ser considerada.",
        ],
      },
      {
        title: "4. Manipulação e depreciação",
        paragraphs: [
          "O produto só deve ser manipulado na medida necessária para verificar a sua natureza, características e funcionamento, como seria razoável numa loja. Utilização excessiva, danos desnecessários, falta de componentes ou conservação inadequada podem originar uma redução proporcional do reembolso pela depreciação comprovada.",
        ],
      },
      {
        title: "5. Exceções",
        paragraphs: [
          "Aplicam-se as exceções legais, incluindo bens selados não suscetíveis de devolução por motivos de saúde ou higiene cujo selo relevante tenha sido retirado depois da entrega, e produtos personalizados. A simples abertura da embalagem de transporte não elimina o direito.",
          "As exceções não afetam os direitos quando o produto está errado, danificado, defeituoso ou não corresponde ao contrato.",
        ],
      },
      {
        title: "6. Custos da devolução",
        paragraphs: [
          "Em caso de mera desistência, os custos diretos da devolução são suportados pelo consumidor. Não aceitamos envios à cobrança sem acordo escrito. Se o artigo estiver errado, danificado, incompleto ou não conforme, os custos necessários são suportados pela Mystic Essence.",
        ],
      },
      {
        title: "7. Reembolso",
        paragraphs: [
          "Numa livre resolução válida, reembolsamos os pagamentos recebidos e, quando todo o contrato é resolvido, o custo da entrega normal menos dispendiosa. Um serviço de entrega mais caro escolhido pelo consumidor não é reembolsado na parte adicional.",
          "O reembolso é efetuado sem demora injustificada e, em regra, no prazo de 14 dias após a comunicação. Pode ser retido até recebermos os bens ou uma prova de envio. É usado o mesmo meio de pagamento, salvo acordo em contrário e sem custos adicionais para o consumidor.",
        ],
      },
      {
        title: "8. Produto errado, danificado ou incompleto",
        paragraphs: [
          `Contacte ${business.email} logo que possível, indicando nome, encomenda, artigo, problema e solução pretendida. Fotografias da embalagem, etiqueta e produto ajudam a análise, mas não restringem direitos. Não utilize um produto com derrame, dano ou sinais de adulteração.`,
        ],
      },
      {
        title: "9. Garantia legal de conformidade",
        paragraphs: [
          "Os produtos estão abrangidos pela garantia legal de conformidade. Em regra, o vendedor é responsável pelas faltas de conformidade que se manifestem no prazo de três anos a contar da entrega. Um artigo pode não estar conforme se não corresponder à descrição, não tiver as características acordadas, não for adequado ao uso normal ou não apresentar a qualidade e segurança razoavelmente esperadas.",
          "Nos termos legais, o consumidor pode ter direito a reparação ou substituição, redução proporcional do preço ou resolução do contrato. A solução é gratuita e depende da natureza do produto, do problema e da hierarquia legal aplicável.",
        ],
      },
      {
        title: "10. Trocas voluntárias",
        paragraphs: [
          "A Mystic Essence não efetua trocas voluntárias diretas. Quando estejam reunidas as condições legais, o consumidor pode exercer a livre resolução e realizar uma nova encomenda. Isto não afeta produtos errados, danificados ou não conformes.",
        ],
      },
      {
        title: "11. Cancelamento antes do envio",
        paragraphs: [
          `Pode pedir o cancelamento antes da expedição através de ${business.email}. Tentaremos satisfazer o pedido, mas não é possível garanti-lo se a preparação ou transporte já tiver começado. Depois da expedição, poderá aplicar-se a livre resolução.`,
        ],
      },
      {
        title: "12. Encomendas não entregues",
        paragraphs: [
          "Se uma encomenda regressar por morada incorreta, recusa, ausência reiterada ou falta de levantamento, poderemos acordar novo envio com pagamento dos custos adicionais razoáveis previamente comunicados. Qualquer dedução será analisada caso a caso e apenas ocorrerá quando legalmente admissível.",
        ],
      },
      {
        title: "13. Reclamações e litígios",
        paragraphs: [
          `Reclamações podem ser enviadas para ${business.email}. O Livro de Reclamações Eletrónico está em www.livroreclamacoes.pt. O consumidor pode recorrer ao CICAP, quando competente, ou consultar as entidades reconhecidas em www.consumidor.gov.pt, sem perder o direito de recorrer aos tribunais.`,
        ],
      },
      {
        title: "14. Alterações",
        paragraphs: [
          "A versão aplicável é, em regra, a que estava em vigor na data da encomenda, sem prejuízo de alterações legais imperativas mais favoráveis ao consumidor. A versão atualizada permanece disponível nesta página.",
        ],
      },
    ],
  },
};
