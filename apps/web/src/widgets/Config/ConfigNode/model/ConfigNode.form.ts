import {
  isNodeRecognized,
  isSectionSettingsRecognized,
  isSettingsSection,
  registryOfSection,
  toSectionSettings,
  type GenericSection,
  type NodeRegistry,
  type SettingsSection,
} from '@entities/Config';
import { hasNodeOverride } from '@features/Config/ConfigNodeForm';

import { FORM_POLICY, NODE_FORM_POLICY } from './ConfigNode.constants';

/** Which form a section node gets, if any; the list row and the node editor read the same answer. */
export interface NodeForm {
  registry: NodeRegistry | null;
  /** A registry node with a form by the policy of its registry. */
  hasNodeForm: boolean;
  /** An object section with a settings schema; `null` for the rest. */
  settingsSection: SettingsSection | null;
  settings: Record<string, unknown> | null;
  hasForm: boolean;
  /** The schema accepted the node: without that the form is disabled and the node is marked. */
  recognized: boolean;
}

export function isNodeObject(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

export function nodeFormOf(section: GenericSection, node: unknown): NodeForm {
  const registry = registryOfSection(section);
  const type: unknown = isNodeObject(node) ? node.type : undefined;
  const settingsSection = registry === null && isSettingsSection(section) ? section : null;
  const settings = settingsSection === null ? null : toSectionSettings(settingsSection, node);
  const hasNodeForm =
    registry !== null &&
    (NODE_FORM_POLICY[registry] === FORM_POLICY.Auto || (typeof type === 'string' && hasNodeOverride(registry, type)));
  const recognized =
    (hasNodeForm && isNodeRecognized(registry, node)) ||
    (settingsSection !== null && settings !== null && isSectionSettingsRecognized(settingsSection, settings));

  return { registry, hasNodeForm, settingsSection, settings, hasForm: hasNodeForm || settings !== null, recognized };
}
