/** Раскладка строки проверки: одна на шапку и строки. Ниже md строка складывается карточкой. */
export const DIAGNOSTICS_COLUMN = {
  Row: 'flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0',
  Name: 'w-56 shrink-0 text-sm max-md:w-full',
  Status: 'w-32 shrink-0 text-sm max-md:w-auto',
  Result: 'flex min-w-0 grow basis-64 flex-col gap-1 text-sm',
} as const;
