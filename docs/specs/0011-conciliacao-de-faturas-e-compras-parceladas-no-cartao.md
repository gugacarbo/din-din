---
status: accepted
date: 2026-07-23
builds-on: []
implemented-by: []
---

# Conciliação de faturas e compras parceladas no cartão

> Convenções compartilhadas: `docs/context/CONVENIONS.md`.

## Objetivo

Permitir o cadastro categorizado de compras em cartão controlado e a liquidação
da fatura sem duplicar despesas. A despesa é reconhecida pelas parcelas no mês
de vencimento; o pagamento é uma atividade financeira neutra e apenas concilia
o valor declarado com os itens cadastrados.

## Fluxo

1. Uma despesa em cartão com controle de fatura gera de uma a 36 parcelas. A
   primeira referência é sugerida pela compra e pelo fechamento, pode ser
   sobrescrita e as demais avançam mês a mês.
2. A tela de faturas agrupa parcelas e pagamentos por cartão e mês, inclusive
   quando existe somente um dos lados.
3. O usuário registra, edita ou remove o pagamento único de uma fatura. O
   pagamento preserva um snapshot do fechamento e vencimento.
4. Uma fatura paga reconhece como gasto efetivo o maior valor entre itens e
   pagamento. A diferença positiva do pagamento vira o bucket derivado
   `Gastos não cadastrados`; itens acima do pagamento geram alerta e continuam
   compondo integralmente a despesa.
5. Dashboard e relatórios posicionam parcelas e o complemento da conciliação no
   vencimento. O histórico mostra compras e liquidações, mas não classifica a
   liquidação como despesa.

## Contrato

- `transaction_installments` contém transação, usuário, cartão, posição, total,
  valor em centavos e referência `YYYY-MM`. Uma compra controlada possui ao
  menos a parcela `1/1`; outras transações não possuem agenda.
- `credit_card_invoice_payments` possui no máximo uma linha por usuário, cartão
  e referência, com data, valor e snapshot do ciclo.
- O total é dividido em centavos inteiros; as primeiras parcelas recebem a
  divisão truncada e a última recebe todo o restante.
- Criar, editar, arquivar ou restaurar uma compra atualiza sua agenda
  atomicamente. Alterar o meio entre cartão controlado e outro meio cria ou
  remove a agenda; um pagamento já registrado é preservado.
- Alterações posteriores no ciclo do cartão só afetam sugestões futuras.
  Referências atribuídas e snapshots de pagamentos não são movidos.
- `InvoiceDto` expõe referência, estado `projected | open | paid`, itens com
  `installmentNumber/installmentCount`, total dos itens, pagamento, gasto
  efetivo, gasto não cadastrado e divergência por itens acima do pagamento.
- Cartão arquivado permite editar/remover uma liquidação existente, mas não
  permite criar uma fatura sem itens.
- Transações antigas lançadas como pagamento de fatura permanecem inalteradas.
  A migration converte somente despesas antigas que já possuíam ciclo de cartão
  em uma parcela `1/1`.

## Casos de borda

| # | QUANDO | o sistema DEVE |
| --- | --- | --- |
| 1 | fechamento ou vencimento usa dia 28–31 | limitar o dia ao último dia válido do mês e preservar viradas de ano |
| 2 | total não divide igualmente pelas parcelas | colocar os centavos restantes somente na última parcela |
| 3 | usuário sobrescreve a primeira referência | preservar o mês informado e derivar os seguintes sequencialmente |
| 4 | pagamento é maior que os itens | reconhecer o pagamento e expor a diferença como `Gastos não cadastrados` |
| 5 | pagamento é menor que os itens | reconhecer todos os itens e sinalizar a divergência |
| 6 | pagamento é igual aos itens | marcar a fatura paga sem complemento nem divergência |
| 7 | pagamento existe sem itens | reconhecer o valor integral como `Gastos não cadastrados` |
| 8 | compra é editada depois da liquidação | recalcular itens e conciliação sem remover nem alterar o pagamento |
| 9 | compra é arquivada ou restaurada | retirar ou recolocar suas parcelas nas faturas e relatórios |
| 10 | pagamento aparece no histórico | usar linguagem neutra, sem categoria nem sinal de despesa |
| 11 | formulário não representa despesa em cartão controlado | ocultar e rejeitar opções de parcelamento |

## Questões em aberto

Nenhuma.

## Definition of Done

```bash
pnpm run test:unit                                      # casos 1–3
pnpm run test:workers                                   # casos 4–10, migration, FKs e isolamento
pnpm exec vitest run --config vitest.ui.config.ts \
  test/ui/finance-page.ui.test.tsx \
  -t "installment|projected|settlement"                 # casos 10–11
pnpm run verify:migration-rollback                      # backfill e integridade
pnpm run release:verify
scripts/docs-check --emit-index
```

## Revisão humana

- Conferir o fluxo de compra parcelada e de registrar/editar/remover pagamento
  em viewport desktop e mobile.
- Conferir a composição visual de `Gastos não cadastrados` no relatório.

## Verificação

```text
pnpm run typecheck: exit 0
pnpm run test:unit: 5 arquivos, 18 testes verdes
pnpm run test:workers: 8 arquivos, 53 testes verdes
pnpm exec vitest run --config vitest.ui.config.ts test/ui/finance-page.ui.test.tsx
  -t "installment|projected|settlement": 3 testes verdes
pnpm run verify:migration-rollback: exit 0; backfill 1/1, FKs, remoção das
  colunas antigas, rollback e reaplicação validados em D1 descartável
pnpm run check: exit 0
pnpm run build: exit 0
scripts/docs-check --emit-index && scripts/docs-check: 3 docs, 0 erros, 0 avisos
pnpm run release:verify: bloqueado em test:ui por 10 expectativas visuais
  anteriores e fora desta spec (card, icon-select, navegação/drawers e Select);
  types:wrangler, prova negativa, check, typecheck e test:unit passaram antes
  do bloqueio. A SPEC permanece accepted até o DoD global ficar verde.
```
