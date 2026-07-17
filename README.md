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

## Banco e release

As migrações versionadas ficam em `drizzle/`. Gere uma nova após alterar
`src/db/schema.ts` com `pnpm run db:generate`. O comando `pnpm run deploy` aplica
as migrações remotas antes de construir e publicar o Worker; confira o
`database_id` em `wrangler.jsonc` e configure os secrets no Cloudflare antes de usá-lo.

O domínio de produção configurado é `dindin.gugacarbo.space`. Configure o Cloudflare
Build para construir apenas a branch `main` e rode `pnpm run deploy` como comando de
deploy, para que a migration seja aplicada antes da versão do app.
