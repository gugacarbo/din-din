---
status: accepted # draft | accepted | implemented | deprecated
date: 2026-09-04
builds-on: [SPEC-0011] # ADRs que fundamentam. A spec CONSOME decisões, não as redefine.
implemented-by: [] # paths reais (código, migrations, functions) — preenchido no fechamento
# design-ref: <url-ou-path> # feature com UI: referência de design NÃO-normativa (ADR-0014).
#                             Código+snapshot ganham dela em divergência; revisar é humano.
---

<!-- id é DERIVADO do filename (docs/specs/NNNN-titulo-kebab.md → SPEC-NNNN);
     title é DERIVADO do H1 abaixo. -->

# Agrupar lançamentos por dia com receitas e despesas separadas

> Convenções compartilhadas (envelope de erro, autorização, acesso a dados):
> `docs/context/CONVENIONS.md`. Esta spec não as repete — só desvia delas
> explicitamente quando necessário.

## Objetivo

Na tela de Lançamentos, apresentar as atividades agrupadas por data civil, com
receitas e despesas em blocos separados por dia. Pagamentos de fatura continuam
visíveis como atividades neutras, sem entrar em nenhum dos dois totais.

## Fluxo

1. A tela carrega as atividades do usuário autenticado em ordem decrescente de
   data civil.
2. Cada página recebida termina no limite de um dia completo; uma data civil
   nunca é dividida entre duas páginas.
3. A interface exibe um cabeçalho para cada data e, dentro dele, os blocos
   `Receitas` e `Despesas` somente quando houver itens do tipo correspondente;
   cada cabeçalho mostra o total monetário separado de cada bloco.
4. Pagamentos de fatura aparecem no mesmo cabeçalho em um bloco de liquidações,
   preservando a linguagem neutra da SPEC-0011.
5. `Carregar mais` acrescenta dias anteriores sem repetir cabeçalhos nem itens.

## Contrato

- O agrupamento usa `activityDate`: `occurredAt` para lançamentos e `paidAt`
  para pagamentos de fatura, ambos tratados como datas civis `YYYY-MM-DD`.
- Uma data pode conter zero, um ou vários lançamentos de cada tipo. O cabeçalho
  mostra `Receitas: R$ X` e `Despesas: R$ Y` separadamente; não há saldo líquido
  nem saldo acumulado diário.
- Receitas são atividades de transação com `type: income`; despesas são
  transações com `type: expense`.
- `invoice_payment` é exibido como liquidação, não é receita nem despesa e não
  altera qualquer total diário.
- O endpoint paginado de atividades deve retornar páginas que não cortem um
  mesmo `activityDate`. O cursor continua opaco e representa a última atividade
  da página.
- Os dias aparecem do mais recente para o mais antigo; dentro de cada dia, os
  blocos semânticos aparecem em `Receitas`, `Despesas`, `Liquidações`, e cada
  bloco preserva a ordenação existente por criação e ID.

## Casos de borda

<!-- Enumerados e DECIDIDOS. Formato sugerido: EARS, agnóstico de stack.
     Caso sem decisão NÃO fica aqui — vai para Questões em aberto.
     Feature com UI (ADR-0014): estados são casos de borda comuns —
     "QUANDO a lista está vazia, DEVE exibir empty-state com CTA";
     "QUANDO a viewport < 768px, a tabela DEVE colapsar em cards".
     Design system/tokens/estados obrigatórios NÃO se redefinem aqui:
     são ADR do repo, citado em builds-on. -->

| #   | QUANDO ⟨gatilho⟩ | o sistema DEVE ⟨resposta⟩ |
| --- | ---------------- | ------------------------- |
| 1 | existem receitas e despesas na mesma data | exibir um cabeçalho para a data com os blocos separados `Receitas: R$ X` e `Despesas: R$ Y`, preservando os sinais, itens e totais originais |
| 2 | uma data contém somente receitas ou somente despesas | exibir apenas o bloco existente com seu total, sem criar total vazio do outro tipo |
| 3 | uma data contém pagamento de fatura | exibir a liquidação em bloco próprio, sem incluí-la em receitas ou despesas |
| 4 | a página paginada alcança itens da mesma data no limite | manter todos os itens dessa data na mesma página; avançar o cursor somente se houver outra data e nunca criar cursor para uma página final |
| 5 | `Carregar mais` busca a página seguinte | acrescentar somente datas/itens ainda não exibidos, sem cabeçalho duplicado |
| 6 | não existem atividades | exibir `Nenhuma atividade por aqui.` |
| 7 | existem atividades de outro usuário | excluir os itens de outro usuário por isolamento da sessão |
| 8 | a viewport é móvel ou o controle é usado por teclado | manter cabeçalhos legíveis, ações operáveis e a ordem de foco existente |

## Questões em aberto

<!-- Cada item BLOQUEIA o ponto correspondente da implementação —
     o agente não improvisa sobre questão aberta. -->

Nenhuma.

## Definition of Done

<!-- OBRIGATÓRIO antes de sair de draft. Comandos com critério binário,
     executáveis no ambiente do AGENTS.md.
     Fecha o loop DESTA spec (§7, ADR-0012): cada caso de borda enumerado acima
     precisa de linha aqui — ou teste referenciado — que o exercite; cite os
     números dos casos no comentário. DoD só com comandos genéricos do repo
     (subconjunto do DoD global do router) é sinal de spec sem fechamento próprio.
     Estados de UI: use comando REAL do repo que os exercite (teste de componente,
     regressão visual, a11y — se a toolchain existir). NUNCA copie comando de
     exemplo que o repo não tem: passa no docs-check e mente (ADR-0014). -->

```bash
pnpm exec vitest run --config vitest.ui.config.ts test/ui/finance-page.ui.test.tsx # casos 1-3, 5-6, 8
pnpm exec vitest run --config vitest.workers.config.ts test/workers/finance-period-boundaries.test.ts test/workers/isolation.test.ts # casos 4, 7
pnpm run typecheck # contrato de agrupamento e cursor
pnpm run release:verify # DoD global
scripts/docs-check --emit-index # índices CASA
```

## Revisão humana

<!-- O que exige olho humano e NÃO está no loop do agente. -->

- Conferir visualmente a leitura dos blocos em mobile e desktop, inclusive com
  dias que contêm as três classes de atividade.

## Verificação

<!-- Preenchida no FECHAMENTO (transição para implemented, mesmo commit que
     preenche implemented-by): evidência do DoD — comandos rodados + resultado. -->

```text
Evidência parcial em 2026-09-04:
- `vitest.workers.config.ts` com `finance-period-boundaries.test.ts` e
  `isolation.test.ts`: 27/27 verdes (casos 4 e 7), incluindo página final
  com mais de 30 itens e sem `nextCursor` vazio.
- `vitest.ui.config.ts` com `finance-page.ui.test.tsx`: 31/31 verdes (casos
  1-3, 5-6 e 8), incluindo totais diários separados de receitas e despesas.
- `vitest.workers.config.ts` com `payments-hierarchy.test.ts`: 32/32 verdes,
  preservando pagamentos neutros da SPEC-0011 (caso 3).
- `tsc --noEmit`, Biome e `git diff --check`: verdes.
- `release:verify`: bloqueado somente em `security:audit`, que reportou 3
  vulnerabilidades high transitivas (`undici`, `js-yaml`, `nanoid`); as etapas
  anteriores passaram, incluindo rollback de 14 migrations e 68 testes Workers.

A SPEC permanece `accepted` e não pode ser marcada `implemented` até o DoD
global ficar verde.
```

<!-- Checklist de fechamento (um commit):
     [ ] DoD verde, evidência acima
     [ ] status: implemented + implemented-by com paths reais
     [ ] gotchas novos → AGENTS.md
     [ ] estado atual novo → capítulo de contexto pertinente
     [ ] scripts/docs-check --emit-index (READMEs regenerados) -->
