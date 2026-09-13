import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, type ReactNode } from 'react';

import type { RuleRow as RuleRowModel } from '@entities/Rule';

import { RuleRow } from './RuleRow';

/** Оценка для первого кадра: точную высоту виртуализатор измеряет сам. */
const ROW_ESTIMATE = 52;
const OVERSCAN = 8;

/**
 * Список правил в порядке файла.
 *
 * Отбор пришёл готовым: поиск и фасет по исходу живут в шапке экрана, чтобы
 * число найденных было видно рядом с полем ввода, а не под ним.
 *
 * Виртуализован из-за NFR-2 — в конфиге бывает до 500 правил.
 */
export function RuleTable({
  rules,
  selectedId,
  empty,
  onSelect,
}: {
  rules: RuleRowModel[];
  selectedId: string | null;
  /** Что показать вместо списка, когда строк нет. */
  empty: ReactNode;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rules.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: OVERSCAN,
  });

  if (rules.length === 0) {
    return (
      <div className='w-full self-start rounded-xl border border-dashed border-border px-4 py-10 text-center'>
        {empty}
      </div>
    );
  }

  return (
    <div className='flex min-h-0 grow flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10'>
      <div ref={scrollRef} data-virtual-viewport='' className='min-h-0 grow overflow-y-auto'>
        <ol className='relative w-full' style={{ height: `${String(virtualizer.getTotalSize())}px` }}>
          {virtualizer.getVirtualItems().map((item) => {
            const rule = rules[item.index];

            return (
              <li
                key={rule.id}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className='absolute inset-x-0 top-0'
                style={{ transform: `translateY(${String(item.start)}px)` }}
              >
                <RuleRow rule={rule} selected={rule.id === selectedId} onSelect={onSelect} />
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
