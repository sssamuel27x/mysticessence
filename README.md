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
3. Mantenha `VITE_PAYMENTS_ENABLED=false` enquanto o parceiro de pagamentos nao estiver configurado.

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

## Firebase

As regras de seguranca encontram-se em `firestore.rules` e `storage.rules`. As funcoes de confirmacao de encomenda, notificacao do administrador e envio de tracking encontram-se em `functions/`.
