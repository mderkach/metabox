import {
  isNodeRecognized,
  isSectionSettingsRecognized,
  isSettingsSection,
  registryOfSection,
  toSectionSettings,
  type GenericSection,
} from '@entities/Config';
import { hasNodeOverride } from '@features/Config/ConfigNodeForm';

import { FORM_POLICY, NODE_FORM_POLICY } from './ConfigNode.constants';

export function isNodeObject(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

/**
 * Which form a section node gets.
 *
 * A node of a section with a type registry gets one if the registry policy
 * allows it: an auto-form to any type, "overrides only" to a type with an
 * override. An object section with a settings schema (`experimental`) gets the
 * section form by the same rule; other sections are edited only as text.
 * `recognized` is false when the schema does not accept the node: the form is
 * then disabled and the node opens as text (ADR-0018).
 */
export function toNodeForm(section: GenericSection, node: unknown) {
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

  return {
    registry: hasNodeForm ? registry : null,
    settingsSection,
    settings,
    hasForm: hasNodeForm || settings !== null,
    recognized,
  };
}
