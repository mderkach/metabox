import { getRouteApi } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  GENERIC_SECTIONS,
  isGenericSection,
  readSectionNodes,
  useConfigDocument,
  type GenericSection,
} from '@entities/Config';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle, QueryFailure, SURFACE, SkeletonRows } from '@shared/ui';
import { ConfigNode } from '@widgets/Config/ConfigNode';

const routeApi = getRouteApi('/config/$section');

export function SectionPage() {
  const { section } = routeApi.useParams();

  // Чужое имя секции отсёк ещё маршрут; здесь проверка только сужает тип.
  if (!isGenericSection(section)) {
    return null;
  }

  return <SectionNodes section={section} />;
}

/**
 * Секция конфига без собственного экрана: каждый её узел открывается формой по
 * схеме типа, если она ему положена, и текстом. Узлы читаются из текста, а не
 * из разобранной модели — узел, который схема не приняла, обязан остаться на
 * экране и правиться.
 */
export function SectionNodes({ section }: { section: GenericSection }) {
  const { t } = useTranslation('pages/Section');
  const document = useConfigDocument();
  const text = document.text;
  const nodes = useMemo(() => (text === null ? [] : readSectionNodes(text, section)), [text, section]);
  const shape = GENERIC_SECTIONS[section];

  return (
    <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6'>
      {document.isPending && <SkeletonRows className={SURFACE} />}

      {document.query.isLoadingError && <QueryFailure messageKey='source.config' query={document.query} />}

      {document.query.isSuccess && shape.kind === 'list' && nodes.length === 0 && (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {document.query.isSuccess && shape.kind === 'object' && (
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
          />
        ))}
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
