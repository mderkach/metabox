import { createContext } from 'react';

interface SidePanelState {
  open: boolean;
  /** The panel has slid away, and there is no reason to keep its content anymore. */
  settled: boolean;
}

export const SidePanelContext = createContext<SidePanelState>({ open: false, settled: true });
