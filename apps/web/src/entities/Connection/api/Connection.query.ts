import { useEffect } from 'react';

import { useOutboundTypes } from '@entities/Config/@x/connection';

import { ConnectionStore } from '../model/Connection.store';

/**
 * A screen declares that it watches the stream. The shell opens the socket:
 * there is no need to keep it open on all screens, and opening it from a
 * component would mean creating a second stream on every reopening of a screen.
 *
 * Outbound types also get into the store from here: snapshot parsing lives
 * outside the component tree, while the config is read by a query, and only the
 * screen can connect them.
 */
export function useConnectionStream(): void {
  const outboundTypes = useOutboundTypes();

  useEffect(function countConnectionReader() {
    const { addReader, removeReader } = ConnectionStore.getState();

    addReader();

    return removeReader;
  }, []);

  useEffect(
    function loadOutboundTypes() {
      ConnectionStore.getState().setOutboundTypes(outboundTypes);
    },
    [outboundTypes]
  );
}
