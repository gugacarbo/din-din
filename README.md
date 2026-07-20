# Din Din

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

`pnpm run types:wrangler:negative` usa a fixture versionada sem o binding
`DB` e confirma que o mesmo `--check` falha por drift, sem alterar o artefato.
Ele também faz parte de `release:verify` para manter essa prova de regressão.

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

## Preflight de produção

Este runbook prepara uma futura publicação em
`https://dindin.gugacarbo.space`. Ele é somente leitura: não execute migration
remota, deploy, rollback, restore de D1 nem altere `wrangler.jsonc`, secrets,
OAuth, DNS, binding do banco ou a configuração de Builds como parte deste
preflight. Esses passos mutáveis exigem uma ordem humana explícita posterior,
acesso autorizado e preflight aprovado.

### Antes de começar

1. Execute `pnpm run release:verify` no SHA que poderá ser publicado e registre
   apenas o resultado passa/falha, o timestamp e o SHA de código.
2. Confirme que a sessão Cloudflare usada pelo operador tem permissão somente
   para consultar a conta e os recursos esperados. Se não tiver acesso, pare.
3. Use `wrangler.jsonc` como fonte do binding `DB`: compare o nome e o estado do
   banco retornados pelo preflight com o banco de produção esperado, sem copiar
   ou publicar o `database_id`.
4. Nunca coloque em issue, Git, CI, terminal compartilhado ou logs valores de
   secrets, IDs, tokens, cookies, bookmarks, SQL, dumps ou dados financeiros.
   A evidência sanitizada contém somente passa/falha, timestamp, SHA e nomes
   públicos permitidos.

### Conferências somente leitura

O operador autorizado pode fazer as verificações abaixo. Guarde respostas
detalhadas apenas no canal seguro aprovado para a operação; não as anexe à
evidência sanitizada.

```bash
pnpm wrangler whoami
pnpm wrangler d1 list --json
pnpm wrangler d1 info <nome-publico-do-banco> --json
pnpm wrangler secret list
```

Confirme no dashboard, sem editar nada, que:

- a conta e o banco D1 identificados correspondem ao ambiente de produção;
- o domínio público `dindin.gugacarbo.space` está roteado ao Worker;
- os nomes `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID` e
  `GOOGLE_CLIENT_SECRET` estão presentes como secrets do Worker, sem consultar
  seus valores;
- o cliente OAuth de produção contém a origem e o callback do domínio de
  produção, enquanto o cliente de localhost permanece separado;
- o aplicativo não usa allowlist: uma futura verificação OAuth usará uma conta
  Google válida no cliente de produção, mas só após nova ordem humana explícita;
- em **Workers Builds > Settings > Build > Branch control**, `main` é a branch
  de produção e builds de branches não produtivas estão desabilitados.

Pare imediatamente e peça decisão humana se faltar autorização, algum recurso
não for identificável, houver divergência de D1, domínio, OAuth ou Builds,
algum secret obrigatório estiver ausente, uma validação falhar ou houver dúvida
sobre o ambiente. Não corrija a divergência automaticamente e não altere o
binding versionado.

### Release e recuperação futuros

Após o preflight aprovado, migration e deploy continuam proibidos até uma nova
ordem humana explícita. Antes de uma migration futura compatível com D1, o
operador autorizado deve capturar o bookmark de recuperação por meio de:

```bash
pnpm wrangler d1 time-travel info <nome-publico-do-banco>
```

O bookmark deve permanecer exclusivamente no canal seguro aprovado: nunca no
README, Git, CI, issue ou logs. Antes de uma publicação futura, registre também
em canal seguro a versão Worker ativa para permitir uma recuperação posterior.

Se uma migration futura, deploy ou smoke OAuth falhar, interrompa as etapas
seguintes. `wrangler rollback` e `wrangler d1 time-travel restore` são operações
mutáveis — o restore é destrutivo — e só podem ser considerados em uma nova
ordem humana específica, usando a recuperação suportada e o bookmark/versão
preservados. Depois de qualquer recuperação, repita o preflight e a validação
pós-recuperação antes de solicitar outra ordem de release.
