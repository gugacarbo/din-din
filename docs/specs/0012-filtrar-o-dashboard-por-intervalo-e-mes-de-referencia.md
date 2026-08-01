---
status: accepted
date: 2026-08-01
builds-on: [SPEC-0011]
implemented-by:
  - src/components/finance/dashboard-period-filter.tsx
  - src/components/finance/finance-page.tsx
  - src/lib/finance-query-options.ts
  - src/lib/finance.ts
  - src/server/finance-service.ts
  - src/server/finance.ts
---

# Filtrar o dashboard por intervalo e mês de referência

> Convenções compartilhadas: `docs/context/CONVENIONS.md`.

## Objetivo

Permitir que o usuário consulte os totais e a origem das entradas do dashboard
em um intervalo civil escolhido no calendário, com um atalho para selecionar o
mês completo que contém uma data de referência.

## Fluxo

1. Ao abrir o dashboard, o calendário inicia com o mês civil corrente no fuso
   de São Paulo selecionado.
2. O usuário pode escolher as datas inicial e final, ambas inclusivas, no
   calendário.
3. O usuário também pode acionar o atalho de mês de referência e escolher uma
   data; o controle seleciona do primeiro ao último dia do mês que contém essa
   data.
4. Quando a seleção está completa e válida, os cards de Entradas, Saídas e
   Saldo e a seção `De onde vieram as entradas` são atualizados para o intervalo.
5. A seção `Últimos lançamentos` continua global e mostra no máximo as cinco
   atividades mais recentes, independentemente do intervalo selecionado.

## Contrato

- A interface trabalha com datas civis `YYYY-MM-DD` e apresenta início e fim
  inclusivos.
- A consulta técnica do dashboard recebe `startDate` inclusiva e `endDate`
  exclusiva. O cliente converte o fim inclusivo escolhido para o dia civil
  seguinte antes de consultar.
- O intervalo válido possui duas datas civis reais e início menor ou igual ao
  fim inclusivo. Somente intervalos completos e válidos entram na chave da
  consulta e chegam ao serviço financeiro.
- Cards e agrupamento de entradas por meio de pagamento consideram somente os
  valores reconhecidos no intervalo técnico `[startDate, endDate)`.
- Compras em cartão controlado seguem a SPEC-0011: cada parcela participa do
  intervalo pela data de vencimento da respectiva fatura, e não pela data da
  compra.
- O estado inicial corresponde ao primeiro e ao último dia do mês que contém a
  data atual em `America/Sao_Paulo`.
- O atalho de mês de referência produz o mês civil completo, inclusive em
  fevereiro bissexto e na virada de dezembro para janeiro.
- Uma seleção incompleta ou inválida mantém o último resultado válido visível e
  não dispara uma nova consulta.
- `Últimos lançamentos` não é filtrado pelo intervalo e permanece limitado a
  cinco atividades do usuário autenticado.

## Casos de borda

| #   | QUANDO                                                                                 | o sistema DEVE                                                                                      |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | o dashboard é aberto perto de uma virada de dia ou mês                                 | calcular o mês inicial pela data civil de São Paulo, sem depender do fuso do navegador ou do Worker |
| 2   | o usuário escolhe um intervalo válido de um único dia                                  | incluir os valores desse dia e enviar como fim técnico o dia civil seguinte                         |
| 3   | o fim inclusivo cai em 29 de fevereiro, no último dia de um mês ou em 31 de dezembro   | avançar o fim técnico para o próximo dia civil, mês ou ano sem perder nem duplicar valores          |
| 4   | o usuário aciona o atalho com uma data de referência                                   | selecionar exatamente o primeiro e o último dia do mês civil correspondente                         |
| 5   | falta uma das datas, uma data civil não existe ou o fim antecede o início              | preservar o último resultado válido e não executar nova consulta                                    |
| 6   | existem lançamentos fora do intervalo ou de outro usuário                              | excluí-los dos cards e da origem das entradas                                                       |
| 7   | uma parcela de cartão controlado foi comprada fora do intervalo, mas vence dentro dele | reconhecer a parcela no vencimento conforme a SPEC-0011                                             |
| 8   | há atividades recentes dentro e fora do intervalo                                      | mostrar globalmente apenas as cinco mais recentes do usuário autenticado                            |
| 9   | o controle é usado por teclado ou em viewport móvel                                    | manter nomes acessíveis, foco operável e seleção legível sem perder o resultado atual               |

## Questões em aberto

Nenhuma.

## Fora do escopo

- Alterar schema, migrations ou persistir a seleção do período.
- Filtrar por categoria ou meio de pagamento.
- Alterar os períodos e filtros da tela de Relatórios.

## Definition of Done

```bash
pnpm exec vitest run --config vitest.unit.config.ts \
  src/lib/finance.test.ts                              # casos 1-4
pnpm exec vitest run --config vitest.ui.config.ts \
  test/ui/finance-page.ui.test.tsx                     # casos 1, 2, 4, 5, 8 e 9
pnpm exec vitest run --config vitest.workers.config.ts \
  test/workers/finance-period-boundaries.test.ts       # casos 2, 3, 6-8
pnpm run typecheck                                     # contrato cliente, query e serviço
pnpm run release:verify                                # DoD global do repositório
scripts/docs-check --emit-index                        # índices CASA frescos
```

## Revisão humana

- Conferir o calendário, o atalho de mês de referência e a atualização dos
  cards em viewports desktop e móvel.
- Conferir que uma seleção incompleta ou inválida não substitui os últimos
  valores válidos nem causa cintilação de carregamento.

## Verificação

```text
pnpm run release:verify: exit 0
- pnpm run types:wrangler:check e pnpm run types:wrangler:negative: passaram
- pnpm run check (Biome) e pnpm run typecheck: passaram
- pnpm run test:unit: 30/30 testes verdes; cobre os casos 1-5 e o limite
  9999-12-31, encontrado na revisão cruzada e corrigido
- pnpm run test:ui: 57/57 testes verdes; cobre os casos 1, 2, 4, 5, 8 e 9
- pnpm run test:workers: 66/66 testes verdes; cobre os casos 2, 3 e 6-8
- pnpm run verify:migration-rollback: journal 14 validado
- pnpm run knip: passou
- scripts/docs-check: 4 docs, 0 erros, 0 avisos
- pnpm audit --prod: 1 vulnerabilidade moderada, abaixo do nível high
  bloqueante
- pnpm run build, inspeção de segredos e wrangler deploy --dry-run: passaram

Verificação visual real pendente: o controle do browser integrado ficou
indisponível por falha de conexão. Conferir em mobile, 1024, 1280 e 1440 px o
calendário nativo, o atalho de mês, foco/teclado, legibilidade e preservação
do resultado durante seleções incompletas ou inválidas. A SPEC permanece
accepted até essa evidência ser concluída.
```
