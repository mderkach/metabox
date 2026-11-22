import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ConnectionState, ConnectionStore } from '@entities/Connection';
import { getRouteExplanationOptions, toRouteExplanation } from '@entities/Route';
import { ApiError } from '@shared/api';

import { pickWalkCandidates, WALK_KINDS, type WalkCandidates, type WalkKind } from '../model/HowItWorks.model';

const EMPTY_CANDIDATES: WalkCandidates = { group: [], server: [], direct: [] };

export function useHowItWorksLive(enabled: boolean) {
  const rows = ConnectionState.use.active();
  const index = ConnectionState.use.index();
  const sampledAt = ConnectionState.use.sampledAt();
  const [offered, setOffered] = useState<WalkCandidates | null>(null);
  const [selected, setSelected] = useState<WalkKind | null>(null);
  const candidates = offered ?? EMPTY_CANDIDATES;
  const kind =
    selected !== null && candidates[selected].length > 0
      ? selected
      : (WALK_KINDS.find((option) => candidates[option].length > 0) ?? null);
  const row = kind === null ? undefined : candidates[kind].at(0);
  const query = useQuery({
    ...getRouteExplanationOptions(row?.id ?? ''),
    enabled: enabled && row !== undefined,
    select: toRouteExplanation,
    refetchOnReconnect: false,
    meta: { showError: false },
  });
  const closed = row !== undefined && sampledAt !== null && !index.has(row.id);
  const discontinued = query.error instanceof ApiError && query.error.code === 'connection_missing';

  if (enabled && offered === null && sampledAt !== null) {
    setOffered(pickWalkCandidates(rows));
  }

  if (discontinued && query.data === undefined && kind !== null && row !== undefined) {
    setOffered((snapshot) => {
      if (snapshot?.[kind].at(0)?.id !== row.id) return snapshot;

      return { ...snapshot, [kind]: snapshot[kind].slice(1) };
    });
  }

  return {
    candidates,
    kind,
    row,
    query,
    closed: closed || discontinued,
    discontinued,
    waitingForFrame: offered === null,
    select: setSelected,
    refresh: () => {
      setOffered(pickWalkCandidates(ConnectionStore.getState().active));
      setSelected(null);
    },
  };
}
