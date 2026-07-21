# Convenções de formulários

## Dados remotos

Toda leitura assíncrona de dados no cliente deve usar TanStack Query. Não use
`fetch`, `createServerFn` ou `useEffect` diretamente para preencher estado
local de dados remotos.

- Use `useQuery` para uma leitura única e `useInfiniteQuery` para listas
  paginadas. Cada query deve ter uma `queryKey` estável que contenha todos os
  parâmetros da leitura e uma `queryFn` que chama a fonte de dados.
- Em loaders e guards de rota, onde hooks não podem ser usados, reutilize
  `queryOptions` com `context.queryClient.ensureQueryData`.
- Use `useMutation` para toda operação que altera dados, inclusive endpoints
  `POST` chamados com `fetch` e `createServerFn` de escrita.
- Após uma mutação bem-sucedida, invalide as queries afetadas com
  `queryClient.invalidateQueries`; não use contadores de `refresh`,
  `setData` manual ou recarregamento da página para sincronizar a interface.
- Mantenha os estados de carregamento, erro, paginação e retry fornecidos
  pelo TanStack Query (`isPending`, `error`, `isFetchingNextPage` etc.).

## Padrão obrigatório

Todo formulário interativo do cliente usa React Hook Form com Zod e o padrão
atual de campos do shadcn/ui. Não mantenha estado duplicado para valores de
campos com `useState` nem trate `React.FormEvent` manualmente.

- Declare o schema Zod próximo ao formulário e inicialize `useForm` com
  `zodResolver(schema)` e `defaultValues` completos.
- Use `form.register` em controles HTML nativos (`Input` e `Textarea`).
- Use `Controller` para componentes controlados, como `Select`, `Switch` e os
  seletores compartilhados de categoria, cor, ícone e tipo.
- Componha cada campo com `Field`, `FieldLabel` e `FieldError` de
  `src/components/ui/field.tsx`. Aplique `aria-invalid` no controle e
  `data-invalid` no `Field` quando houver erro.
- Submeta com `form.handleSubmit`. Desabilite a ação primária com
  `form.formState.isSubmitting`, sem criar um estado de carregamento paralelo.

## Validação e erros

O schema informa erros de entrada por campo; `FieldError` os exibe de forma
acessível. Falhas retornadas pelo servidor permanecem separadas dos erros do
schema e são apresentadas com `Notice` ou `Alert`.

## Componentes compartilhados

Os selects de domínio continuam sendo a única origem de marcação visual e
comportamento de suas opções. O formulário só conecta valor, mudança e estado
de validação com `Controller`; não recria opções de categoria, ícone, cor ou
tipo dentro da tela.

## Referência

O padrão acompanha a composição de React Hook Form do shadcn/ui: `Controller`
para controles compostos e `Field`/`FieldLabel`/`FieldError` para estrutura,
rótulo e feedback do campo.
