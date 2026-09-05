---
status: accepted # draft | accepted | implemented | deprecated
date: 2026-09-04
builds-on: [] # ADRs que fundamentam. A spec CONSOME decisões, não as redefine.
implemented-by: [] # paths reais (código, migrations, functions) — preenchido no fechamento
# design-ref: <url-ou-path> # feature com UI: referência de design NÃO-normativa (ADR-0014).
#                             Código+snapshot ganham dela em divergência; revisar é humano.
#                             Código+snapshot ganham dela em divergência; revisar é humano.
---

<!-- id é DERIVADO do filename (docs/specs/NNNN-titulo-kebab.md → SPEC-NNNN);
     title é DERIVADO do H1 abaixo. -->

# Alternar gráfico de receitas por categoria e forma de pagamento

> Convenções compartilhadas (envelope de erro, autorização, acesso a dados):
> `docs/context/CONVENIONS.md`. Esta spec não as repete — só desvia delas
> explicitamente quando necessário.

## Objetivo

Na tela de Relatórios, exibir um gráfico de setores para receitas e permitir
alternar sua decomposição entre categoria e forma de pagamento.

## Fluxo

1. O relatório mantém o gráfico de despesas por categoria existente.
2. Um segundo gráfico mostra o total de receitas do período.
3. O controle acessível `Agrupar receitas por` alterna entre `Categoria` e
   `Forma de pagamento` sem recarregar a página nem alterar o período.
4. O centro, rótulo acessível e tooltip do gráfico refletem o agrupamento ativo
   e seu total em BRL.

## Contrato

- O relatório expõe agrupamentos de receitas por categoria e por forma de
  pagamento, com identificador, nome, cor quando aplicável e `amountCents`.
- Somente receitas não arquivadas do usuário autenticado e do período do
  relatório participam dos dois agrupamentos.
- Categoria sem forma de pagamento aparece como `Não informado`; forma de
  pagamento sem receita não aparece.
- O gráfico de categoria usa as cores configuradas da categoria. O gráfico por
  forma de pagamento usa uma paleta determinística compartilhada da tela.
- O total de ambos os agrupamentos é exatamente `incomeCents`.
- O botão de alternância possui nome acessível e indica o modo ativo; seleção
  via teclado é equivalente ao clique.

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
| 1 | há receitas em múltiplas categorias | o modo `Categoria` exibir um setor por categoria e somar exatamente `incomeCents` |
| 2 | há receitas em múltiplas formas de pagamento | o modo `Forma de pagamento` exibir um setor por forma e somar exatamente `incomeCents` |
| 3 | uma receita não tem forma de pagamento | agrupá-la em `Não informado` |
| 4 | não há receitas no período | exibir estado vazio claro e não um gráfico sem significado |
| 5 | o usuário alterna o agrupamento | preservar período e dados de despesas, atualizar rótulos/tooltip sem nova consulta |
| 6 | existem despesas ou categorias de outro usuário | não incluí-las no gráfico de receitas |
| 7 | o controle é usado por teclado ou viewport móvel | manter nome acessível, foco visível e controles operáveis |

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
pnpm exec vitest run --config vitest.ui.config.ts test/ui/finance-page.ui.test.tsx # casos 1-5, 7
pnpm exec vitest run --config vitest.workers.config.ts test/workers/finance-period-boundaries.test.ts test/workers/isolation.test.ts # casos 1-3, 6
pnpm run typecheck # contrato de agrupamentos
pnpm run release:verify # DoD global
scripts/docs-check --emit-index # índices CASA
```

## Revisão humana

<!-- O que exige olho humano e NÃO está no loop do agente. -->

- Conferir contraste das paletas e leitura dos dois gráficos em mobile e desktop.

## Verificação

<!-- Preenchida no FECHAMENTO (transição para implemented, mesmo commit que
     preenche implemented-by): evidência do DoD — comandos rodados + resultado. -->

```text
Evidência parcial em 2026-09-04:
- `vitest.workers.config.ts` com `finance-period-boundaries.test.ts`:
  agrupamentos de receitas por categoria e forma de pagamento verdes.
- `vitest.ui.config.ts` com `finance-page.ui.test.tsx`: 31/31 verdes,
  cobrindo os dois modos, alternância acessível, preservação da query e estado
  vazio.
- `tsc --noEmit`, Biome e `git diff --check`: verdes.
- `release:verify`: bloqueado somente em `security:audit`, que reportou 3
  vulnerabilidades high transitivas (`undici`, `js-yaml`, `nanoid`); as etapas
  anteriores passaram, incluindo 30 unitários, 60 UI e 68 Workers.

A SPEC permanece `accepted` e não pode ser marcada `implemented` até o DoD
global ficar verde.
```

<!-- Checklist de fechamento (um commit):
     [ ] DoD verde, evidência acima
     [ ] status: implemented + implemented-by com paths reais
     [ ] gotchas novos → AGENTS.md
     [ ] estado atual novo → capítulo de contexto pertinente
     [ ] scripts/docs-check --emit-index (READMEs regenerados) -->
