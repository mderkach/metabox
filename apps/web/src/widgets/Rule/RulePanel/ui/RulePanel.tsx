import { X } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState } from '@entities/Config';
import type { RuleRow } from '@entities/Rule';
import { RuleEditForm } from '@features/Rule/RuleEdit';
import { RuleRawEditor } from '@features/Rule/RuleRaw';
import { useFocusReturn } from '@shared/lib/useFocusReturn';
import { cn } from '@shared/lib/utils';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  SECTION_HEADING,
  SECTION_LABEL,
  SURFACE,
  SURFACE_HEAD,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui';

const BREAK_POINT = /(?=\.)|(?<=_)/;

const TAB = {
  Form: 'form',
  Raw: 'raw',
} as const;

/**
 * Rule panel: the outbound form and the same node as text.
 *
 * A node the schema did not accept gets no form at all — it is shown
 * as a raw block with a mark and is edited only as text.
 *
 * `sheet` — the panel stands inside a sheet on top of the list: the sheet holds the frame and focus,
 * and the panel title becomes its title.
 */
export function RulePanel({
  id,
  rule,
  node,
  recognized,
  outbounds,
  ruleSets,
  actions = null,
  sheet = false,
  onClose,
}: {
  id?: string;
  rule: RuleRow;
  node: unknown;
  recognized: boolean;
  outbounds: string[];
  /** Rule set tags of the document: the form picks the rule's rule sets from them. */
  ruleSets: string[];
  /** Actions on the rule: header, before the close button. */
  actions?: ReactNode;
  sheet?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('widgets/Rule/RulePanel');
  const [tab, setTab] = useState<string>(recognized ? TAB.Form : TAB.Raw);
  // The form writes on every change and follows edits of its own node: a
  // remount on a node change would drop focus after each keystroke. It is
  // rebuilt only when the document is replaced from outside, by a discard of
  // the draft or a reread from the device.
  const revision = ConfigDocumentState.use.revision();
  const headingRef = useFocusReturn<HTMLHeadingElement>();

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  return (
    // Escape closes the panel: a handler on the container is a common pattern for
    // panels and dialogs, an interactive role on aside is not needed for it.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
    <aside
      id={id}
      aria-label={t('title', { index: rule.index })}
      onKeyDown={onKeyDown}
      className={cn(
        'flex min-h-0 flex-col overflow-hidden',
        !sheet && ['w-full max-w-md shrink-0 max-lg:max-h-[70vh]', SURFACE]
      )}
    >
      <header className={cn('flex items-center gap-2.5', SURFACE_HEAD)}>
        <div className='flex min-w-0 grow flex-col'>
          {sheet ? (
            <SheetTitle className={SECTION_HEADING}>{t('title', { index: rule.index })}</SheetTitle>
          ) : (
            <h2
              ref={headingRef}
              tabIndex={-1}
              className={cn(
                '-mx-1.5 -my-0.5 rounded-md px-1.5 py-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                SECTION_HEADING
              )}
            >
              {t('title', { index: rule.index })}
            </h2>
          )}
          <p className='font-mono text-xs text-muted-foreground'>route.rules[{rule.index - 1}]</p>
        </div>
        {!recognized && <Badge variant='outline'>{t('rule.uncovered', { ns: 'shared' })}</Badge>}
        {actions !== null && <div className='flex shrink-0 items-center gap-0.5'>{actions}</div>}
        <Button
          variant='outline'
          size='icon-sm'
          aria-label={t('action.closePanel', { ns: 'shared' })}
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto p-4'>
        <RuleConditions rule={rule} />

        {!recognized && (
          <Alert>
            <AlertTitle>{t('unknown.title')}</AlertTitle>
            <AlertDescription>{t('unknown.description')}</AlertDescription>
          </Alert>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant='line'>
            <TabsTrigger value={TAB.Form} disabled={!recognized}>
              {t('tab.form')}
            </TabsTrigger>
            <TabsTrigger value={TAB.Raw}>JSON</TabsTrigger>
          </TabsList>

          {/* The form keeps what was typed while the node is checked as text: unmounting erases it. */}
          <TabsContent value={TAB.Form} keepMounted className='pt-3'>
            {recognized && <RuleEditForm key={revision} rule={rule} outbounds={outbounds} ruleSets={ruleSets} />}
          </TabsContent>

          <TabsContent value={TAB.Raw} className='pt-3'>
            <RuleRawEditor key={revision} index={rule.index} node={node} />
          </TabsContent>
        </Tabs>
      </div>
    </aside>
  );
}

/**
 * Wrap points before the dot of a domain or address and after an underscore in a field
 * name: the browser does not see them there by itself and would break a long value at an arbitrary
 * letter. Mid-part wrapping remains only for a part wider than the row.
 */
function withBreaks(text: string): ReactNode[] {
  return text.split(BREAK_POINT).flatMap((part, index) => (index === 0 ? [part] : [<wbr key={index} />, part]));
}

/**
 * Rule conditions are read-only: the form edits only rule sets of them, the rest
 * are edited as node text. Values are shown in full, without folding into "and N more", unlike
 * a list row, where there is no room for them.
 */
function RuleConditions({ rule }: { rule: RuleRow }) {
  const { t } = useTranslation('widgets/Rule/RulePanel');
  // An unrecognized node is never "without conditions": there is a condition in it, it is just that
  // the schema does not know its fields, and there is no way to show it as a form.
  if (rule.isCatchAll && !rule.recognized) {
    return <p className='rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground'>{t('conditions.unknown')}</p>;
  }

  if (rule.isCatchAll) {
    return <p className='rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground'>{t('conditions.empty')}</p>;
  }

  if (rule.group !== null) {
    return (
      <p className='rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground'>
        {t('conditions.group', { mode: rule.group.mode })}
      </p>
    );
  }

  return (
    <section className='flex flex-col gap-1.5'>
      <h3 className={SECTION_LABEL}>{t('rule.conditions', { ns: 'shared' })}</h3>
      <dl className='flex flex-col gap-1'>
        {rule.matchers.map((matcher) => (
          <div key={matcher.key} className='flex gap-3 border-t border-border py-1.5 text-xs first:border-t-0'>
            <dt className='w-32 shrink-0 font-mono wrap-anywhere text-muted-foreground'>{withBreaks(matcher.key)}</dt>
            <dd className='min-w-0 grow font-mono wrap-anywhere'>
              <ul>
                {matcher.values.map((value, index) => (
                  <li key={index} className='inline'>
                    {withBreaks(value)}
                    {index < matcher.values.length - 1 && ', '}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
      {rule.invert && <p className='text-xs text-muted-foreground'>{t('conditions.inverted')}</p>}
    </section>
  );
}
