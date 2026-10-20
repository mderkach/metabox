/**
 * Field name in its label: the human label with the config key next to it in
 * small monospace, so that the field is found both by meaning and by the
 * sing-box documentation; a field without a label shows the key alone. The key
 * next to a label is hidden from screen readers: the field name is the label.
 */
export function ConfigNodeFormFieldName({ label, fieldKey }: { label: string | null; fieldKey: string }) {
  if (label === null) {
    return <span className='font-mono text-xs'>{fieldKey}</span>;
  }

  return (
    <>
      <span>{label}</span>
      <span aria-hidden className='font-mono text-xs font-normal text-muted-foreground'>
        {fieldKey}
      </span>
    </>
  );
}
