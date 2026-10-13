import { Info, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SCHEMA_DRIFT, SCHEMA_VERSION, schemaDrift, useServiceState } from '@entities/Daemon';
import { Alert, AlertDescription } from '@shared/ui';

/**
 * Mismatch between the sing-box version on the device and the form schema. It
 * sits in the configuration section, not above all screens: the mismatch
 * concerns only forms, and on Overview or Connections it would drown out what
 * the user came there for.
 *
 * A binary newer than the schema is a note: forms will not show new fields but
 * will not break anything. A binary older than the schema is a warning: it may
 * reject a field from the form.
 */
export function SchemaDriftNotice() {
  const { t } = useTranslation('app');
  const service = useServiceState();
  const binary = service.data?.binary;
  const drift = schemaDrift(binary);

  if (drift === SCHEMA_DRIFT.None) {
    return null;
  }

  return (
    <Alert>
      {drift === SCHEMA_DRIFT.Newer ? <Info /> : <TriangleAlert />}
      <AlertDescription>{t(`drift.${drift}`, { schema: SCHEMA_VERSION, binary })}</AlertDescription>
    </Alert>
  );
}
