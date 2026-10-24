import type { ListChanges } from '@entities/Config';
import { stateCreator } from '@shared/lib/state';

/** What this tab sent with an accepted Apply: the draft as it was at that moment. */
export interface SubmittedApply {
  id: string;
  text: string;
  lists: ListChanges;
}

interface ConfigApplyState {
  /**
   * The Apply this tab started, kept until the daemon reports its end. Memory
   * only, deliberately: after a reload the tab no longer knows what it sent,
   * and a transaction it cannot recognise must not touch the draft.
   */
  submitted: SubmittedApply | null;
  submit: (apply: SubmittedApply) => void;
  /** Returns the record when `id` is the submitted transaction, and forgets it. */
  settle: (id: string) => SubmittedApply | null;
}

const ConfigApplyStateProto = stateCreator<ConfigApplyState>(
  (set, get) => ({
    submitted: null,

    submit: (apply) => {
      set({ submitted: apply });
    },

    settle: (id) => {
      const { submitted } = get();

      if (submitted?.id !== id) return null;

      set({ submitted: null });

      return submitted;
    },
  }),
  'ConfigApply'
);

export const ConfigApplyStore = ConfigApplyStateProto;
