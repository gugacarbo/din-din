# din din

Aplicação de finanças pessoais em português, com autenticação Google, categorias,
lançamentos e relatórios em BRL. Roda no Cloudflare Workers, usa D1 e Drizzle.

## Desenvolvimento local

```bash
pnpm install
cp .dev.vars.example .dev.vars
# preencha BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET
pnpm run db:migrate:local
pnpm run dev
```

Cadastre no cliente OAuth local o callback `http://localhost:3000/api/auth/callback/google`.
Para produção, use `https://dindin.gugacarbo.space/api/auth/callback/google`.

## Qualidade

```bash
pnpm run release:verify
```

Os tipos do Worker são gerados de `wrangler.jsonc` em
`src/worker-configuration.d.ts` e são versionados. Depois de alterar bindings
ou vars do Worker, execute `pnpm run types:wrangler` e inclua o arquivo gerado
no commit. Em clone limpo, use `pnpm run types:wrangler:check` para confirmar
que o artefato continua compatível; esse comando também faz parte de
`release:verify`.

`pnpm test` executa tanto os testes unitários quanto a suíte Workers. A última
roda contra um D1 local e efêmero do Miniflare, aplica as migrations de
`drizzle/` e nunca acessa o D1 remoto ou credenciais OAuth reais.

## Banco e release

As migrações versionadas ficam em `drizzle/`. Gere uma nova após alterar
`src/db/schema.ts` com `pnpm run db:generate`. O comando `pnpm run deploy` aplica
as migrações remotas antes de construir e publicar o Worker; confira o
`database_id` em `wrangler.jsonc` e configure os secrets no Cloudflare antes de usá-lo.

O domínio de produção configurado é `dindin.gugacarbo.space`. Configure o Cloudflare
Build para construir apenas a branch `main` e rode `pnpm run deploy` como comando de
deploy, para que a migration seja aplicada antes da versão do app.
