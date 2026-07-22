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

1. O bootstrap instala buffers em memória de, no máximo, 50 logs e 50 requests já redigidos; valores textuais de cookie, autorização, token e senha são removidos antes do buffer.
2. O diálogo global coleta categoria, mensagem e print opcional do viewport atual, com preview, remoção e nova captura; o print respeita `scrollX`/`scrollY` e exclui o diálogo e qualquer elemento marcado com `data-support-capture-exclude`.
3. `POST /api/support` reautentica, limita tamanho/rate, persiste D1, envia o print privado para R2 e enfileira só o `reportId` opaco.
4. A fila usa AI somente para texto privado sanitizado; uma barreira determinística rejeita schema inválido, sintaxe ativa, PII, secrets ou eco de conteúdo privado.
5. O publicador determinístico usa GitHub App de permissão mínima e cria issue em `gugacarbo/din-din` somente com texto aprovado e labels allowlisted.
6. Aos 30 dias, o cron apaga o objeto R2 e a linha inteira `support_report_payloads`; pai e tasks preservam somente metadados operacionais opacos.

## Contrato

- Categorias: `Problema/erro`, `Dúvida/ajuda`, `Sugestão`; mensagem de 1–4.000 caracteres.
- Screenshot opcional PNG/WebP até 2 MiB; payload total até 3 MiB. Não há endpoint ou URL pública de leitura.
- Nenhum body/header/query/cookie/token, valor de campo ou URL OAuth entra em buffers, D1 público, AI ou GitHub.
- Antes da persistência, o servidor redige novamente o diagnóstico, limita cada valor e conserva somente os eventos mais recentes que caibam em 65.536 bytes; argumentos de console sem schema confiável (incluindo objetos, ciclos e valores de formulário) viram marcadores seguros, e paths conservam somente o pathname. A inserção nunca depende de um erro de `CHECK` para aplicar esse limite.
- O `metadata` privado é derivado exclusivamente do JSON de diagnóstico já sanitizado e limitado, contendo apenas pathname da rota, viewport e estado online; não pode serializar o input bruto.
- O screenshot nunca é lido pelo consumer nem enviado a AI/GitHub.
- Cinco relatos aceitos por usuário em quinze minutos; chave idempotente divergente retorna conflito.
- Em falha ambígua de rede/5xx, cliente reutiliza exatamente o payload serializado, diagnóstico, screenshot e UUID da tentativa lógica; um novo relato exige ação explícita.
- Falhas de AI/publicação ambígua são `manual_review` e geram outbox/DLQ; não há retry cego de POST ao GitHub. Falha transitória anterior ao POST solicita retry para que a fila entregue automaticamente o envelope `triage` à DLQ após `max_retries`; somente o consumer da DLQ registra o esgotamento seguro. Falha de envio de uma task pendente permanece isolada, com log seguro, e não interrompe o cleanup de retenção.
- O consumer da DLQ só pode converter para `failed` um estado pendente/em fila ou um processamento sem reserva e com lease vencido; envelopes antigos não rebaixam `published`, `manual_review`, `failed`, processamento ativo ou reserva de publicação, nem criam task de falha espúria.
- Antes de AI, o consumer obtém um lease condicional por relato. Reentregas enquanto o lease está válido reconhecem o trabalho em curso; lease vencido pode ser recuperado. Imediatamente antes de GitHub, uma reserva transacional durável renova/valida o lease e bloqueia qualquer segundo POST mesmo que o primeiro runtime ultrapasse o lease. Reentrega que encontra essa reserva sem resultado a encaminha para revisão manual/outbox, sem novo POST.
- Todo campo produzido pela AI é normalizado em Unicode/espaços e rejeitado se tiver PII (CPF/CNPJ, e-mail, cartões ou telefone brasileiro/internacional plausível, inclusive sem `+` e com prefixo segmentado `0`/`00`), URL com ou sem protocolo, Markdown/HTML ativo, menção ou referência GitHub acionável (`#123`/`owner/repo#123`).

## Casos de borda

| #   | QUANDO                                    | o sistema DEVE                                                        |
| --- | ----------------------------------------- | --------------------------------------------------------------------- |
| 1   | usuário offline ou sem sessão             | impedir/rejeitar sem confirmar recebimento                            |
| 2   | captura do print falha ou excede limite   | manter relato recuperável e informar erro local                       |
| 3   | objeto/log possui segredo, ciclo ou query | redigir/truncar antes da persistência                                 |
| 4   | chegam mais de 50 eventos                 | conservar somente os 50 mais recentes                                 |
| 5   | AI retorna conteúdo inseguro ou eco       | fixar `manual_review`, publicar task e não criar issue                |
| 6   | GitHub tem resultado ambíguo              | não repetir POST; encaminhar para revisão manual                      |
| 7   | payload privado vence                     | remover R2 e apagar a linha filha integralmente, de forma idempotente |

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
pnpm run test:unit: 13 testes verdes
pnpm run test:ui: 29 testes verdes
pnpm run test:workers: 43 testes verdes
pnpm run verify:migration-rollback: exit 0
scripts/docs-check --emit-index && scripts/docs-check: 0 erros, 0 avisos
pnpm run build: exit 0 (avisos esperados de secrets locais ausentes e chunks grandes)
```
