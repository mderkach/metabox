import { useMemo } from 'react';

import {
  ConfigDocumentState,
  readRuleNames,
  readRules,
  readRuleSetTags,
  toFinalOutbound,
  toOutboundTags,
  toOutboundTypes,
  useConfigDocument,
  type ConfigDocumentView,
  type ConfigIssue,
} from '@entities/Config';
import { toRuleRowsFromNodes, type RuleRow } from '@entities/Rule';

export interface RouteEditorState {
  text: string | null;
  /** Config request: a source failure is a screen state of its own, not an empty list. */
  source: ConfigDocumentView['query'];
  appliedEtag: string | null;
  isAppliedDocument: boolean;
  issues: ConfigIssue[];
  rules: RuleRow[];
  outbounds: string[];
  /** Rule set tags of the document: a rule can reference them from the form. */
  ruleSets: string[];
  /** Outbound of a new rule is the default route; `null` means there is no outbound. */
  finalOutbound: string | null;
  /** Outbound type by tag: a rule's outbound is colored by it, not by name. */
  outboundTypes: ReadonlyMap<string, string>;
  /** Rule nodes as they are: the panel edits the node text, not the parsed model. */
  nodes: unknown[];
  /** Rule nodes of the file from the device, without draft edits. */
  appliedNodes: unknown[];
  /** Rule names of the file from the device, one per node of `appliedNodes`. */
  appliedNames: (string | null)[];
}

/**
 * Rule list for the screen. The section document is read by a shared hook, only its
 * parsing into rows stays here.
 *
 * The mapping is called here, not in the markup: it walks the whole list, and with
 * 500 rules it would repeat on every keystroke in the search.
 */
export function useRouteEditor(): RouteEditorState {
  const document = useConfigDocument();
  const appliedEtag = ConfigDocumentState.use.appliedEtag();
  const text = document.text;

  // Nodes are read from the text, not from the parsed model: a rule that the
  // schema did not accept must stay visible in the list.
  const nodes = useMemo(() => (text === null ? [] : readRules(text)), [text]);

  const rules = useMemo(() => toRuleRowsFromNodes(nodes, text === null ? [] : readRuleNames(text)), [nodes, text]);
  const ruleSets = useMemo(() => (text === null ? [] : readRuleSetTags(text)), [text]);

  const config = document.config;
  const outboundTypes = useMemo(() => toOutboundTypes(config), [config]);

  const appliedText = document.appliedText;
  const appliedNodes = useMemo(() => (appliedText === null ? [] : readRules(appliedText)), [appliedText]);
  const appliedNames = useMemo(() => (appliedText === null ? [] : readRuleNames(appliedText)), [appliedText]);

  return {
    source: document.query,
    text,
    appliedEtag,
    isAppliedDocument: appliedText !== null && text === appliedText && !document.isDirty,
    issues: document.issues,
    rules,
    outbounds: toOutboundTags(config),
    ruleSets,
    finalOutbound: toFinalOutbound(config),
    outboundTypes,
    nodes,
    appliedNodes,
    appliedNames,
  };
}
