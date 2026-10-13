import type { UseQueryResult } from '@tanstack/react-query';
import { useDeferredValue, useEffect } from 'react';

import { parseConfig, useConfig, useConfigLists, type ConfigIssue, type ParsedConfig } from '../api/Config.query';
import type { ConfigDocument } from './Config.model';
import { ConfigDocumentState, useConfigDirty, useConfigText } from './Config.store';

/** How many recent texts the draft parse remembers. */
const PARSED_DRAFTS = 2;

/** Parsed drafts by text; insertion order is access order. */
const parsedDrafts = new Map<string, ParsedConfig>();

/**
 * The draft is read by both the section layout and the screen under it. Without
 * shared memory the same text would be parsed twice per edit.
 *
 * The memory is module-level, not `useMemo`: it is shared by all consumers and
 * lives until the end of the tab session, and neither `discard` nor `reset`
 * clears it. The key is the text itself, so a stale parse cannot come back.
 *
 * There are two entries, not one, because of `useDeferredValue`: while the
 * screen shows the parse of text T1, a background render manages to parse T2,
 * but a new keystroke interrupts it before display. The urgent render of that
 * keystroke asks for T1 again, and a single-slot memory would already hold T2,
 * so the T1 parse would repeat in the urgent render that deferring was meant to
 * leave.
 */
function parseDraft(text: string): ParsedConfig {
  const remembered = parsedDrafts.get(text);
  const parsed = remembered ?? parseConfig(text);

  // Access moves the entry to the end: a text not needed for a long time is evicted.
  parsedDrafts.delete(text);
  parsedDrafts.set(text, parsed);

  if (parsedDrafts.size > PARSED_DRAFTS) {
    const [oldest] = parsedDrafts.keys();

    parsedDrafts.delete(oldest);
  }

  return parsed;
}

export interface ConfigDocumentView {
  isPending: boolean;
  /**
   * Request for the file from the device. Its flags are the screen states: a
   * failure here yields an empty document, and by emptiness it cannot be told
   * from a config without rules.
   */
  query: UseQueryResult<ParsedConfig>;
  /**
   * The document the user sees: the draft, and before any edits the file from
   * the device. A draft the schema did not accept yields `null`, and with it
   * the section counters in the tab strip and the outbound list in the rule set
   * connection form disappear. Rollback to the applied config is deliberately
   * not done here: showing the parse of a text other than the one being edited
   * is worse.
   *
   * While typing it lags `text` by a frame: parsing is deferred behind input.
   */
  config: ConfigDocument | null;
  /** Its own text: nodes are read from here so those the schema did not accept stay visible. */
  text: string | null;
  /** File text from the device, without edits: the draft is compared against it. */
  appliedText: string | null;
  /** Schema remarks on the shown document; they lag together with `config`. */
  issues: ConfigIssue[];
  /** The schema did not accept the file from the device: forms are not built from it, the text is edited. */
  notParsed: boolean;
  /**
   * Counter of document updates that did not come from the user. The text
   * editor uses it to understand that its content is stale.
   */
  revision: number;
  isDirty: boolean;
}

/**
 * The config document for the whole section: the query, loading into the store
 * and draft parsing in one place.
 *
 * Draft parsing, `parseJsonc` of the whole file and the whole strict schema,
 * runs in a deferred render (`useDeferredValue`): in text mode the draft
 * changes on every character, and parsing in the urgent render would stand
 * between a keystroke and the letter on screen. The text, the edit flag and the
 * update counter are read bypassing the parse and do not lag; the parsed
 * document is needed by tab counters and form lists, for which a frame of lag
 * does not matter.
 */
export function useConfigDocument(): ConfigDocumentView {
  const config = useConfig();
  const lists = useConfigLists();
  const load = ConfigDocumentState.use.load();
  const loadLists = ConfigDocumentState.use.loadLists();
  const draft = ConfigDocumentState.use.draft();
  const revision = ConfigDocumentState.use.revision();
  const isDirty = useConfigDirty();
  const current = useConfigText();
  const applied = config.data?.text ?? null;
  const etag = config.data?.etag ?? null;
  const listFiles = lists.data?.files;
  const listsEtag = lists.data?.etag ?? null;

  useEffect(
    function loadDocument() {
      if (applied !== null) load(applied, etag);
    },
    [applied, etag, load]
  );

  // List files go into the store the same way as the config text: apply takes
  // both the file changes and the set base from it.
  useEffect(
    function loadListFiles() {
      if (listFiles !== undefined) loadLists(listFiles, listsEtag);
    },
    [listFiles, listsEtag, loadLists]
  );

  const parsedDraft = useDeferredValue(draft);
  const shown = (parsedDraft === null ? null : parseDraft(parsedDraft)) ?? config.data ?? null;

  return {
    isPending: config.isPending,
    query: config,
    config: shown?.config ?? null,
    text: current ?? applied,
    appliedText: applied,
    issues: shown?.issues ?? [],
    notParsed: config.data?.config === null,
    revision,
    isDirty,
  };
}
