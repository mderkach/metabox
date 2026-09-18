import type { ConnectionRow } from '@entities/Connection';

import { MIME, type ExportFormat } from '../model/ConnectionExport.constants';
import { toExportBody } from './ConnectionExport.serialize';

/** `2026-09-13T15:04:05` — ISO без миллисекунд и зоны: имя файла, а не метка времени. */
const ISO_SECONDS_LENGTH = 19;

/**
 * Выгрузка отфильтрованного списка файлом. Blob и ссылка, а не ручка демона:
 * данные уже в панели, и лишний обход через устройство только добавил бы
 * состояние, которое может разойтись с экраном.
 *
 * Ссылка добавляется в документ, а объектный URL отзывается следующим кадром:
 * Firefox не запускает скачивание по клику вне документа, а отзыв сразу после
 * `click()` успевает освободить blob до того, как браузер начнёт его читать.
 */
export function downloadConnections(rows: ConnectionRow[], format: ExportFormat, stamp: Date) {
  const body = toExportBody(rows, format);
  // react-doctor-disable-next-line react-doctor/no-create-object-url-without-revoke -- отзыв стоит в кадре ниже, за границей разбора правила
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
