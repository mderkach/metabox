import { toProxyGroups, toStandaloneNodes, useProxies, useProxyProviders } from '@entities/Proxy';
import { plural } from '@shared/lib/format';
import { Card, CardContent, CardHeader } from '@shared/ui';
import { ProxyGroups } from '@widgets/ProxyGroups';

/** `updatedAt` приходит в ISO; экрану нужна дата без времени. */
const ISO_DATE_LENGTH = 10;

const NODE_FORMS = ['узел', 'узла', 'узлов'] as const;

export function ProxiesPage() {
  const proxies = useProxies();
  const providers = useProxyProviders();

  const groups = toProxyGroups(proxies.data);
  const nodes = toStandaloneNodes(proxies.data);
  const subscriptions = Object.values(providers.data?.providers ?? {});

  return (
    <>
      <header className='flex min-h-14 shrink-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-border px-4 py-2.5 sm:px-6'>
        <h1 className='text-base font-medium'>Прокси</h1>
        <p className='text-xs text-muted-foreground'>рантайм sing-box: конфиг эти действия не меняют</p>
      </header>

      <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        {proxies.isPending && <p className='text-sm text-muted-foreground'>Загружаю прокси…</p>}

        {proxies.isSuccess && <ProxyGroups groups={groups} nodes={nodes} />}

        {subscriptions.length > 0 && (
          <Card className='gap-0 overflow-hidden py-0'>
            <CardHeader className='flex flex-row items-center gap-2.5 border-b border-border px-4 py-3'>
              <h2 className='text-sm font-medium'>Подписки</h2>
              <p className='text-xs text-muted-foreground'>узлы приезжают из них, а не из конфига</p>
            </CardHeader>
            <CardContent className='px-0'>
              <ul>
                {subscriptions.map((provider) => (
                  <li key={provider.name} className='flex items-center gap-3 border-t border-border px-4 py-2.5'>
                    <span className='min-w-0 grow truncate text-sm'>{provider.name}</span>
                    <span className='text-xs text-muted-foreground'>{plural(provider.proxies.length, NODE_FORMS)}</span>
                    <time dateTime={provider.updatedAt} className='font-mono text-xs text-muted-foreground'>
                      {provider.updatedAt.slice(0, ISO_DATE_LENGTH)}
                    </time>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
