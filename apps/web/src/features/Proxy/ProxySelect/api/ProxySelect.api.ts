import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getProxiesOptions, PROXY_QUERY, selectProxy, withSelectedNode } from '@entities/Proxy';

interface SelectVariables {
  group: string;
  node: string;
}

/**
 * Переключение узла в группе. Обновление оптимистичное: ответ рантайма ничего
 * не добавляет к тому, что уже известно, а задержка ответа читалась бы как
 * зависший интерфейс. Цену Apply это не имеет — конфиг не пишется.
 */
export function useSelectProxy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async function requestSelect({ group, node }: SelectVariables) {
      return selectProxy(group, node);
    },
    meta: { showError: true, errorMessageKey: 'proxy.select.failed' },
    onMutate: async ({ group, node }: SelectVariables) => {
      await queryClient.cancelQueries({ queryKey: PROXY_QUERY.list() });

      const previous = queryClient.getQueryData(getProxiesOptions().queryKey);

      if (previous !== undefined) {
        queryClient.setQueryData(getProxiesOptions().queryKey, withSelectedNode(previous, group, node));
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(getProxiesOptions().queryKey, context.previous);
      }
    },
    onSettled: async () => queryClient.invalidateQueries({ queryKey: PROXY_QUERY.list() }),
  });
}
