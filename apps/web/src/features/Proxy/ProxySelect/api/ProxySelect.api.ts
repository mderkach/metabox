import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getProxiesOptions, PROXY_QUERY, selectProxy, withSelectedNode } from '@entities/Proxy';

interface SelectVariables {
  group: string;
  node: string;
}

/**
 * Node switching in a group. The update is optimistic: the runtime response
 * adds nothing to what is already known, and a response delay would read as a
 * hung interface. Apply cost does not apply here: the config is not written.
 *
 * There is no success toast: the node mark is visible at once, and a live
 * region of the screen announces the choice to a screen reader. A `sonner`
 * toast would announce it a second time.
 */
export function useSelectProxy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async function requestSelect({ group, node }: SelectVariables) {
      return selectProxy(group, node);
    },
    meta: { showError: true, errorMessageKey: 'toast.proxy.select.failed' },
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
