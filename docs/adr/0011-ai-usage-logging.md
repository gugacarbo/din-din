---
status: accepted
date: 2026-07-22
builds-on: []
superseded-by: null
deciders:
  - gugacarbo
---

# Registrar uso de LLM/AI no D1 com métricas de invocação

## Contexto e problema

O app chama `env.AI.run` durante a triagem de relatos de suporte. Hoje não há registro persistente dessas invocações — apenas `console.error` em falhas. Sem métricas de uso (tokens, latência, modelo, TTFT) é impossível auditar custos, diagnosticar regressões de qualidade ou responder a incidentes de AI. O Cloudflare Workers Observability captura `console.*`, mas não retém tokens/TTFT de forma queryável.

## Direcionadores da decisão

- **Auditoria de custo**: Workers AI cobra por token; sem contabilidade persistente não há como reconciliar fatura.
- **Diagnóstico de qualidade**: saber qual modelo e prompt produziu um resultado rejeitado (`manual_review`) ajuda a iterar.
- **Latência observável**: TTFT e tempo total são métricas operacionais que `console.*` não preserva de forma estruturada.
- **Privacidade**: o conteúdo do prompt já é sanitizado antes de chegar à AI (SPEC-0010); o log deve registrar metadados, não o prompt completo.
- **Simplicidade**: D1 já é o banco operacional; adicionar uma tabela evila introduzir um datastore novo.

## Opções consideradas

### Opção 1 — Tabela `ai_invocations` no D1

**Prós:**

- Reutiliza infra existente; sem novo binding.
- Queryável via SQL no dashboard do D1.
- Permite JOIN com `support_reports` para correlacionar triagem ↔ resultado.

**Contras:**

- Adiciona uma escrita síncrona por invocação de AI.
- D1 tem limites de escrita por Worker; volume atual (baixo) não é problema.

### Opção 2 — Logs estruturados no Workers Observability (console.info)

**Prós:**

- Zero mudança de schema; só adicionar `console.info` com JSON.

**Contras:**

- Retenção limitada do Workers Observability; não é queryável via SQL.
- Não permite JOIN com dados operacionais.
- TTFT e tokens não são extraídos automaticamente do `AI.run` — precisam ser lidos do retorno.

### Opção 3 — Analytics Engine do Cloudflare

**Prós:**

- Desenhado para alta cardinalidade e volume de eventos.

**Contras:**

- Binding adicional e configuração extra.
- SQL via API REST, não via D1; mais um datastore para gerenciar.
- Volume atual não justifica.

## Decisão

Adotar a **Opção 1**: criar a tabela `ai_invocations` no D1 com colunas para `model`, `agent_key` (identifica o processo/agente, ex.: `issue-writer`), `user_id` (FK para `user`, opcional), `report_id` (FK para `support_reports`, opcional), `input_tokens`, `output_tokens`, `total_tokens`, `ttft_ms`, `duration_ms`, `success`, `error_message`, `metadata` (JSON livre para metadados adicionais do processo) e `created_at`. A escrita acontece em um wrapper `runAiWithLogging` que envolve `env.AI.run`, extrai métricas do objeto de retorno e persiste via D1. A persistência é best-effort: falha ao gravar o log não derruba a triagem.

## Consequências

- **Positivas**: auditoria de custo e qualidade de AI queryável em SQL; correlação com `support_reports` e `user`; rastreabilidade por agente/processo via `agent_key`; metadados extensíveis via `metadata` JSON.
- **Negativas**: uma escrita D1 extra por invocação de AI; migration nova (0007).
- **Obrigatório**: toda chamada a `env.AI.run` no código de produção deve passar pelo wrapper `runAiWithLogging`, informando `agentKey` obrigatório.
- **Proibido**: logar o conteúdo do prompt ou qualquer dado privado; somente metadados de uso.

## Confirmação

```bash
# Toda chamada de AI em produção passa pelo wrapper:
grep -rn "env\.AI\.run" src/ | grep -v "runAiWithLogging" | grep -v test && exit 1
# A tabela existe no schema:
grep "ai_invocations" src/db/schema.ts drizzle/0007_*.sql
```

## Notas

- O objeto retornado por `env.AI.run` no Workers AI expõe `usage` (`prompt_tokens`, `completion_tokens`, `total_tokens`) e, quando aplicável, métricas de latência. O wrapper normaliza esses campos com fallback seguro.
- Se futuramente o volume crescer, pode-se migrar para Analytics Engine sem mudar o contrato do wrapper.
