# AGENTS.md

```yaml
casa-repo-id: din-din # usado em referências cross-repo (repo:ADR-0001)
casa-tier: T1 # T0 (leve) | T1 (padrão) — STANDARD §3
casa-version: 1.8 # versão do contrato CASA adotado (promessa do repo, ADR-0010)
casa-standard-ref: 7cdb964 # versão do casa-standard de origem — o casa-init carimba
```

> Padrão: https://github.com/atplus-digital/casa-standard (STANDARD.md)
> ROUTER (CASA §4): carga sempre, teto ~150 linhas. Só alto-ROI transversal.
> Estourou o teto → conteúdo desce para docs/context/, fica o ponteiro.
> ⚠️ NÃO usar @import para colar capítulos: @import expande tudo no launch.
> Regras de um pacote específico → <subdir>/AGENTS.md (lazy nativo, nearest-wins).

## Contexto em 5 linhas

App de finanças pessoais (din-din) rodando em Cloudflare Workers com React (TanStack Start), D1 (SQLite) e Drizzle ORM. Stack: TypeScript, Vite, Tailwind CSS, shadcn/ui. CASA T1 com governança via docs-check e casa-update-check.

## Infra & ambientes

- **Runtime**: Cloudflare Workers (wrangler)
- **Database**: Cloudflare D1 (SQLite) — binding `DB` em `wrangler.jsonc`
- **ORM**: Drizzle com driver `d1-http` — NUNCA usar `better-sqlite3` (removido)
- **Auth**: Better Auth com Google; use `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` em `.dev.vars` e como secrets do Worker. `BETTER_AUTH_URL` é a URL pública do ambiente.
- **CI**: GitHub Actions — `casa-update-check.yml`, `docs-check.yml`
- **Hooks**: Husky — `pre-commit` (lint-staged + format), `pre-push` (typecheck + test)

## Como rodar localmente

```bash
pnpm install
cp .dev.vars.example .dev.vars   # preencha os secrets de Auth Google
pnpm run db:migrate:local
pnpm run dev                      # wrangler dev + vite
```

## Como validar (DoD global do repo)

```bash
pnpm run release:verify
```

Ele inclui uma prova negativa versionada: `pnpm run types:wrangler:negative`
deve passar ao confirmar que uma configuração de fixture sem `DB` torna o
artefato de tipos desatualizado, sem alterar arquivos.

## Como deployar

Configure o `database_id` real do D1 e os secrets do Worker antes do primeiro
deploy. Use `pnpm run deploy`: ele aplica as migrations remotas, faz build e
publica o Worker nessa ordem. Nunca execute migration remota apontando para o
placeholder `YOUR_DATABASE_ID`.

## Git & PRs

<!-- Convenções; quando commitar; se há remote; se o agente abre PR sem ser pedido. -->

## Gotchas

<!-- Conhecimento NÃO-INFERÍVEL que já custou tentativas falhas. Todo gotcha
     descoberto pelo agente DEVE ser registrado aqui. -->

- `transactions` possui FK composta para `categories` que garante usuário e tipo
  compatíveis; não contorne essa regra com SQL manual.

## Mapa de contexto

<!-- Índice dos capítulos (docs/context/), cada um com QUANDO carregar.
     Capítulo = estado atual, imperativo, atemporal. Decisão datada = ADR. -->

| Capítulo       | Quando carregar |
| -------------- | --------------- |
| (nenhum ainda) | —               |

## Mapa de docs

- Decisões: `docs/adr/` · Comportamento: `docs/specs/` (READMEs GERADOS — não editar)
- Validar: `scripts/docs-check` · Regenerar índices: `scripts/docs-check --emit-index`
