import { X } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState } from '@entities/Config';
import { useRuleTitle, type RuleRow } from '@entities/Rule';
import { actionOutsideForm, RuleEditForm } from '@features/Rule/RuleEdit';
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
  SURFACE,
  SURFACE_HEAD,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui';

import { RulePanelConditions } from './RulePanelConditions';

const TAB = {
  Form: 'form',
  Raw: 'raw',
} as const;

/**
 * Rule panel: the form and the same node as text. The title is the rule
 * name or its label from the content; the number goes under it.
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
  onCreate,
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
  /**
   * The rule is not in the document yet: the form creates it here on the first
   * condition. Until then there is no node to show as text.
   */
  onCreate?: (node: Record<string, unknown>) => boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('widgets/Rule/RulePanel');
  const { title: titleOf } = useRuleTitle();
  const creating = onCreate !== undefined;
  const title = creating ? t('titleNew', { index: rule.index }) : titleOf(rule);
  const number = t('rule.numbered', { ns: 'shared', index: rule.index });
  const formlessAction = actionOutsideForm(node);
  const formable = recognized && formlessAction === null;
  const [tab, setTab] = useState<string>(formable ? TAB.Form : TAB.Raw);
  // Keyed by revision, not by the node: the form writes on every keystroke and would lose focus.
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
      aria-label={title}
      onKeyDown={onKeyDown}
      className={cn(
        'flex min-h-0 flex-col overflow-hidden',
        !sheet && ['w-full max-w-md shrink-0 max-lg:max-h-[70vh]', SURFACE]
      )}
    >
      <header className={cn('flex items-center gap-2.5', SURFACE_HEAD)}>
        <div className='flex min-w-0 grow flex-col'>
          {sheet ? (
            <SheetTitle className={cn(SECTION_HEADING, 'wrap-anywhere')}>{title}</SheetTitle>
          ) : (
            <h2
              ref={headingRef}
              tabIndex={-1}
              className={cn(
                '-mx-1.5 -my-0.5 rounded-md px-1.5 py-0.5 wrap-anywhere outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                SECTION_HEADING
              )}
            >
              {title}
            </h2>
          )}
          {!creating && title !== number && <p className='text-xs text-muted-foreground'>{number}</p>}
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
        {!creating && <RulePanelConditions rule={rule} />}
        {creating && <p className='text-sm text-pretty text-muted-foreground'>{t('creating')}</p>}

        {!recognized && (
          <Alert>
            <AlertTitle>{t('unknown.title')}</AlertTitle>
            <AlertDescription>{t('unknown.description')}</AlertDescription>
          </Alert>
        )}

        {recognized && formlessAction !== null && (
          <p className='text-sm text-pretty text-muted-foreground'>{t('formlessAction', { action: formlessAction })}</p>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant='line'>
            <TabsTrigger value={TAB.Form} disabled={!formable}>
              {t('tab.form')}
            </TabsTrigger>
            {!creating && <TabsTrigger value={TAB.Raw}>JSON</TabsTrigger>}
          </TabsList>

          {/* The form keeps what was typed while the node is checked as text: unmounting erases it. */}
          <TabsContent value={TAB.Form} keepMounted className='pt-3'>
            {formable && (
              <RuleEditForm key={revision} rule={rule} outbounds={outbounds} ruleSets={ruleSets} onCreate={onCreate} />
            )}
          </TabsContent>

          {!creating && (
            <TabsContent value={TAB.Raw} className='pt-3'>
              <RuleRawEditor key={revision} index={rule.index} node={node} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </aside>
  );
}
