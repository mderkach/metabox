import { useState } from 'react';

import { useDiagReport, type DiagRun } from '@entities/Diag';

export function useDiagRun() {
  const [run, setRun] = useState<DiagRun | null>(null);
  const report = useDiagReport(run);

  function start(proxy: string) {
    setRun({ proxy, run: Date.now() });
  }

  return { started: run !== null, report, start };
}
