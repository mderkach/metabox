import type { ConnectionRow, ConnectionSourceLabel } from '@entities/Connection';

import { MIME, type ExportFormat } from '../model/ConnectionExport.constants';
import { toExportBody } from './ConnectionExport.serialize';

/** `2026-09-13T15:04:05` is ISO without milliseconds and zone: a file name, not a timestamp. */
const ISO_SECONDS_LENGTH = 19;

/**
 * Export of the filtered list as a file. A Blob and a link, not a daemon
 * endpoint: the data is already in the panel, and an extra trip through the
 * device would only add state that may diverge from the screen.
 *
 * The link is added to the document, and the object URL is revoked on the next
 * frame: Firefox does not start a download on a click outside the document, and
 * a revoke right after `click()` manages to free the blob before the browser
 * starts reading it.
 */
export function downloadConnections(
  rows: ConnectionRow[],
  format: ExportFormat,
  stamp: Date,
  sourceLabel: ConnectionSourceLabel
) {
  const body = toExportBody(rows, format, sourceLabel);
  // react-doctor-disable-next-line react-doctor/no-create-object-url-without-revoke -- the revoke is in the frame below, beyond the rule's analysis boundary
  const url = URL.createObjectURL(new Blob([body], { type: MIME[format] }));
  const link = document.createElement('a');

  link.href = url;
  link.download = `metabox-connections-${stamp.toISOString().slice(0, ISO_SECONDS_LENGTH).replaceAll(':', '-')}.${format}`;
  link.hidden = true;
  document.body.append(link);
  link.click();

  globalThis.requestAnimationFrame(function releaseBlob() {
    link.remove();
    URL.revokeObjectURL(url);
  });
}
