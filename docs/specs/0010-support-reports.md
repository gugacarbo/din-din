---
status: implemented
date: 2026-07-21
builds-on: []
implemented-by:
  - src/components/support-dialog.tsx
  - src/lib/support-diagnostics.ts
  - src/server/support-service.ts
  - src/server/support-queue.ts
  - drizzle/0004_support_reports.sql
---

# Relatos de suporte privados com triagem pública sanitizada

> Convenções compartilhadas: `docs/context/CONVENIONS.md`.

## Objetivo

Permitir que usuários autenticados enviem um relato de problema, dúvida ou sugestão com diagnóstico técnico limitado. A confirmação se limita a `Recebemos sua mensagem`; processamento, triagem e issue ocorrem em background.

## Fluxo

1. O bootstrap instala buffers em memória de, no máximo, 50 logs e 50 requests já redigidos.
2. O diálogo global coleta categoria, mensagem e print opcional do viewport, com preview, remoção e nova captura.
3. `POST /api/support` reautentica, limita tamanho/rate, persiste D1, envia o print privado para R2 e enfileira só o `reportId` opaco.
4. A fila usa AI somente para texto privado sanitizado; uma barreira determinística rejeita schema inválido, sintaxe ativa, PII, secrets ou eco de conteúdo privado.
5. O publicador determinístico usa GitHub App de permissão mínima e cria issue em `gugacarbo/din-din` somente com texto aprovado e labels allowlisted.
6. Aos 30 dias, o cron apaga o objeto R2 e a linha inteira `support_report_payloads`; pai e tasks preservam somente metadados operacionais opacos.

## Contrato

- Categorias: `Problema/erro`, `Dúvida/ajuda`, `Sugestão`; mensagem de 1–4.000 caracteres.
- Screenshot opcional PNG/WebP até 2 MiB; payload total até 3 MiB. Não há endpoint ou URL pública de leitura.
- Nenhum body/header/query/cookie/token, valor de campo ou URL OAuth entra em buffers, D1 público, AI ou GitHub.
- O screenshot nunca é lido pelo consumer nem enviado a AI/GitHub.
- Cinco relatos aceitos por usuário em quinze minutos; chave idempotente divergente retorna conflito.
- Falhas de AI/publicação ambígua são `manual_review` e geram outbox/DLQ; não há retry cego de POST ao GitHub. Retry automático é reservado a falha transitória anterior ao POST.
- Antes de AI ou GitHub, o consumer obtém um lease condicional por relato. Reentregas enquanto o lease está válido reconhecem o trabalho em curso; lease vencido pode ser recuperado. Uma ambiguidade pós-POST consulta o marcador opaco e, se inconclusiva, vai para revisão manual sem novo POST.

## Casos de borda

| # | QUANDO | o sistema DEVE |
| --- | --- | --- |
| 1 | usuário offline ou sem sessão | impedir/rejeitar sem confirmar recebimento |
| 2 | captura do print falha ou excede limite | manter relato recuperável e informar erro local |
| 3 | objeto/log possui segredo, ciclo ou query | redigir/truncar antes da persistência |
| 4 | chegam mais de 50 eventos | conservar somente os 50 mais recentes |
| 5 | AI retorna conteúdo inseguro ou eco | fixar `manual_review`, publicar task e não criar issue |
| 6 | GitHub tem resultado ambíguo | não repetir POST; encaminhar para revisão manual |
| 7 | payload privado vence | remover R2 e apagar a linha filha integralmente, de forma idempotente |

## Questões em aberto

Nenhuma.

## Definition of Done

```bash
pnpm run test:unit                 # casos 3–6
pnpm run test:ui                   # casos 1–2
pnpm run test:workers              # endpoint/auth/migrações locais
pnpm run verify:migration-rollback # caso 7 e guard de down
pnpm run release:verify
```

## Revisão humana

- Conferir o diálogo desktop/mobile, foco por teclado e a captura sem o próprio diálogo.
- Antes do deploy, configurar bucket/fila, GitHub App com somente `Issues: write` e os secrets no Worker.

## Verificação

```text
pnpm run typecheck: exit 0
pnpm run test:unit: 9 testes verdes
pnpm run test:ui: 27 testes verdes
pnpm run test:workers: 24 testes verdes
pnpm run build: exit 0 (somente aviso esperado de secrets ausentes nesta worktree)
```
