import { getRouteApi } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { startTransition, useMemo, useState, ViewTransition } from 'react';
import { useTranslation } from 'react-i18next';

import {
  GENERIC_SECTIONS,
  isGenericSection,
  readNodeTags,
  readSectionNodes,
  registryOfSection,
  useConfigDocument,
  type GenericSection,
} from '@entities/Config';
import { useDaemonStatus } from '@entities/Daemon';
import { ConfigNodeAddForm } from '@features/Config/ConfigNodeAdd';
import { usePanelAsSheet } from '@shared/lib/media';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  QueryFailure,
  SURFACE,
  SkeletonRows,
} from '@shared/ui';
import { ConfigNode } from '@widgets/Config/ConfigNode';
import { ConfigNodePanel, ConfigNodePanelSheet } from '@widgets/Config/ConfigNodePanel';

const routeApi = getRouteApi('/config/$section');

export function SectionPage() {
  const { section } = routeApi.useParams();

  // Чужое имя секции отсёк ещё маршрут; здесь проверка только сужает тип.
  if (!isGenericSection(section)) {
    return null;
  }

  // Секция в ключе: панель и набранное в форме добавления относятся к своей
  // секции и на соседнюю не переезжают.
  return <SectionNodes key={section} section={section} />;
}

/**
 * Секция конфига без собственного экрана: каждый её узел открывается формой по
 * схеме типа, если она ему положена, и текстом. Узлы читаются из текста, а не
 * из разобранной модели — узел, который схема не приняла, обязан остаться на
 * экране и правиться.
 *
 * Узел секции с реестром типов добавляется формой в панели рядом со списком
 * (ADR-0037); ниже `lg` панель открывается листом. Секции-объекты и списки без
 * реестра пополняются только текстом.
 */
export function SectionNodes({ section }: { section: GenericSection }) {
  const { t } = useTranslation('pages/Section');
  const document = useConfigDocument();
  const status = useDaemonStatus();
  const asSheet = usePanelAsSheet();
  const [adding, setAdding] = useState(false);
  const text = document.text;
  const nodes = useMemo(() => (text === null ? [] : readSectionNodes(text, section)), [text, section]);
  const takenTags = useMemo(() => (text === null ? [] : readNodeTags(text)), [text]);
  const builtTags = status.data?.singboxTags ?? null;
  const shape = GENERIC_SECTIONS[section];
  const addable = shape.kind === 'list' && registryOfSection(section) !== null;
  const loaded = document.query.isSuccess;

  function toggleAdding() {
    startTransition(() => {
      setAdding((open) => !open);
    });
  }

  function closeAdding() {
    startTransition(() => {
      setAdding(false);
    });
  }

  const addButton = (
    <Button variant='outline' size='sm' aria-expanded={adding} onClick={toggleAdding}>
      <Plus data-icon='inline-start' />
      {t('add.open')}
    </Button>
  );

  const addForm = (
    <ConfigNodeAddForm section={section} takenTags={takenTags} builtTags={builtTags} onAdded={closeAdding} />
  );

  return (
    <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6'>
      {document.isPending && <SkeletonRows className={SURFACE} />}

      {document.query.isLoadingError && <QueryFailure messageKey='source.config' query={document.query} />}

      {loaded && addable && nodes.length > 0 && <div className='flex justify-end'>{addButton}</div>}

      <div className='flex flex-col gap-4 lg:flex-row lg:items-start'>
        <div className='flex min-w-0 grow flex-col gap-4'>
          {loaded && shape.kind === 'list' && nodes.length === 0 && (
            <Empty className='border'>
              <EmptyHeader>
                <EmptyTitle>{t('empty.title')}</EmptyTitle>
                <EmptyDescription>{t(addable ? 'empty.description' : 'empty.descriptionText')}</EmptyDescription>
              </EmptyHeader>
              {addable && <EmptyContent>{addButton}</EmptyContent>}
            </Empty>
          )}

          {loaded && shape.kind === 'object' && (
            <ConfigNode
              key={document.revision}
              section={section}
              index={0}
              node={nodes.length === 0 ? undefined : nodes[0]}
              name={section}
            />
          )}

          {shape.kind === 'list' &&
            nodes.map((node, index) => (
              // Ревизия в ключе пересоздаёт форму и редактор на обновлении не от
              // пользователя: после отмены правок поле не должно держать
              // отменённый текст.
              <ConfigNode
                key={`${String(document.revision)}:${String(index)}`}
                section={section}
                index={index}
                node={node}
                name={nodeName(shape.path, node, index)}
                builtTags={builtTags}
              />
            ))}
        </div>

        {addable && adding && !asSheet && (
          <ViewTransition enter='panel-in' exit='panel-out'>
            <ConfigNodePanel title={t('add.title')} onClose={closeAdding}>
              {addForm}
            </ConfigNodePanel>
          </ViewTransition>
        )}
      </div>

      {/* Ниже lg панели рядом со списком нет места: там она открывается листом. */}
      {addable && asSheet && (
        <ConfigNodePanelSheet open={adding} title={t('add.title')} onClose={closeAdding}>
          {addForm}
        </ConfigNodePanelSheet>
      )}
    </div>
  );
}

/**
 * Имя узла на экране: тег, без него — тип, без обоих — путь в файле
 * (`dns.rules[3]`), а не имя вкладки: по нему узел находится в тексте.
 */
function nodeName(path: readonly string[], node: unknown, index: number): string {
  if (typeof node === 'object' && node !== null) {
    const tag: unknown = Reflect.get(node, 'tag');

    if (typeof tag === 'string' && tag.length > 0) {
      return tag;
    }

    const type: unknown = Reflect.get(node, 'type');

    if (typeof type === 'string' && type.length > 0) {
      return type;
    }
  }

  return `${path.join('.')}[${String(index)}]`;
}
