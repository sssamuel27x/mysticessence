# Mystic Essence

Loja online da Mystic Essence, perfumaria arabe em Santa Maria da Feira.

## Desenvolvimento local

Requer Node.js 22 ou superior.

```bash
npm install
npm run dev
```

O site fica disponivel em `http://localhost:3000`.

## Configuracao

1. Duplique `.env.example` para `.env.local`.
2. Preencha as variaveis publicas do projeto Firebase.
3. Mantenha `VITE_PAYMENTS_ENABLED=false` enquanto os segredos IFTHENPAY nao estiverem configurados nas Firebase Functions.

Os ficheiros `.env*` locais nao sao enviados para o GitHub.

## Verificacao

```bash
npm run build:netlify
npm run lint
```

## Publicacao no Netlify

O Netlify usa a configuracao de `netlify.toml`:

- comando: `npm run build:netlify`
- pasta publicada: `netlify-dist`
- Node.js 22

As variaveis `VITE_*` de `.env.example` devem ser configuradas no painel do Netlify. As rotas da loja usam uma regra de fallback para continuarem a funcionar quando uma pagina e aberta diretamente.

Para uma publicacao manual, execute o build com `.env.local` configurado e publique apenas `netlify-dist`. A pasta inclui `public/_redirects`, para preservar as rotas sem depender de um build no Netlify. Nunca publique os ficheiros de segredos.

## Firebase

As regras de seguranca encontram-se em `firestore.rules` e `storage.rules`. As funcoes de confirmacao de encomenda, notificacao do administrador e envio de tracking encontram-se em `functions/`.

Os portes sao guardados em `settings/shipping`, as marcas criadas em `brands` e as galerias em cada produto. As alteracoes de portes e marcas feitas em localhost ficam apenas nesse navegador; no dominio publicado sao guardadas no Firebase. Alteracoes aos portes no servidor exigem tambem a publicacao de `functions/shipping.mjs` com as funcoes.

### IFTHENPAY

O checkout suporta MB WAY, Multibanco, Payshop e cartao Visa/Mastercard. As chaves nunca ficam no frontend nem no repositorio. Configure os seguintes segredos nas Firebase Functions:

```text
IFTHENPAY_MB_KEY
IFTHENPAY_MBWAY_KEY
IFTHENPAY_PAYSHOP_KEY
IFTHENPAY_CARD_KEY
IFTHENPAY_CALLBACK_KEY
IFTHENPAY_BACKOFFICE_KEY
```

Depois de publicar a funcao `ifthenpayCallback`, ative os callbacks HTTPS dos quatro metodos contratados com `npm run ifthenpay:activate-callbacks`. O comando usa as chaves do ficheiro local ignorado `functions/.secret.local`, nunca as mostra e configura Multibanco, MB WAY, Payshop e cartao com a mesma chave anti-phishing guardada em `IFTHENPAY_CALLBACK_KEY`. So depois dessa ativacao os pagamentos passam automaticamente de pendentes para pagos.

Apple Pay e Google Pay requerem ainda uma Gateway Key da IFTHENPAY. As chaves individuais desses metodos, sem a Gateway Key, nao chegam para iniciar o checkout de carteira digital.
