import type { ReactNode } from 'react';

/**
 * Screen header. `children` is the screen state: the overview verdict, the connection stream
 * progress, the config document and its draft; explanations of the content
 * stand at their own section, not here. `actions` are actions on the screen
 * document, for example version history, not actions on a list: those live in
 * the list card, see Tables.md.
 *
 * Named for View Transitions: on a section change the header dissolves in
 * place instead of sliding away with the content; between tabs of one section it
 * stays live.
 */
export function PageHeader({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className='flex min-h-14 shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3 [view-transition-name:page-header] sm:px-6'>
      <h1 className='text-2xl font-semibold'>{title}</h1>
      {children}
      {actions !== undefined && (
        <>
          <span className='grow' />
          {actions}
        </>
      )}
    </header>
  );
}
