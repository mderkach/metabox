import { useId, useRef, useState } from 'react';

export function useProxyMetadataEditor() {
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const editorId = useId();

  function open() {
    setEditing(true);
  }

  function close() {
    setEditing(false);
    trigger.current?.focus();
  }

  return { editing, trigger, editorId, open, close };
}
