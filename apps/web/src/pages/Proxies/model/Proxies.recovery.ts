import {
  diffNode,
  isNodeRecognized,
  NODE_REGISTRY,
  readSectionNodes,
  sectionNodePath,
  supportsVlessRealityHybridKeyShare,
} from '@entities/Config';
import { DELAY_STATE, type ProxyNode } from '@entities/Proxy';
import { isRecord } from '@shared/lib/isRecord';

const HYBRID_KEY_SHARE = 'support_x25519mlkem768';

export interface RealityRecoveryField {
  path: ReturnType<typeof sectionNodePath>;
  value: boolean | undefined;
  endpoint: Record<string, unknown>;
}

function editablePositions(nodes: readonly unknown[]): Map<string, number | undefined> {
  const positions = new Map<string, number | undefined>();

  nodes.forEach((node, index) => {
    if (isRecord(node) && typeof node.tag === 'string') {
      positions.set(node.tag, positions.has(node.tag) || !hasEditableReality(node) ? undefined : index);
    }
  });

  return positions;
}

function hasEditableReality(node: Record<string, unknown>): boolean {
  const tls = node.tls;

  return (
    node.type === 'vless' &&
    isRecord(tls) &&
    tls.enabled === true &&
    isRecord(tls.reality) &&
    tls.reality.enabled === true &&
    isNodeRecognized(NODE_REGISTRY.Outbound, node)
  );
}

export function realityRecoveryField(text: string, tag: string): RealityRecoveryField | null {
  const nodes = readSectionNodes(text, 'outbounds');
  const index = editablePositions(nodes).get(tag);
  if (index === undefined) return null;

  const node = nodes[index];
  if (!isRecord(node) || !isRecord(node.tls) || !isRecord(node.tls.reality)) return null;

  const value = node.tls.reality[HYBRID_KEY_SHARE];
  if (value !== undefined && typeof value !== 'boolean') return null;

  const reality = { ...node.tls.reality };
  delete reality[HYBRID_KEY_SHARE];

  return {
    path: [...sectionNodePath('outbounds', index), 'tls', 'reality', HYBRID_KEY_SHARE],
    value,
    endpoint: { ...node, tls: { ...node.tls, reality } },
  };
}

export function sameRealityEndpoint(left: RealityRecoveryField, right: RealityRecoveryField): boolean {
  return diffNode([], left.endpoint, right.endpoint).length === 0;
}

export function realityRecoveryHints(
  applied: string | undefined,
  failed: ReadonlySet<string>,
  runtime: readonly ProxyNode[]
): { tag: string }[] {
  if (applied === undefined || failed.size === 0 || !supportsVlessRealityHybridKeyShare()) return [];

  const nodes = readSectionNodes(applied, 'outbounds');
  const positions = editablePositions(nodes);

  return runtime.flatMap(({ name: tag, type, delayState }) => {
    if (type.toLowerCase() !== 'vless' || delayState !== DELAY_STATE.Failed || !failed.has(tag)) return [];

    const index = positions.get(tag);
    if (index === undefined) return [];

    const node = nodes[index];
    if (!isRecord(node) || !isRecord(node.tls) || !isRecord(node.tls.reality)) return [];
    if (node.tls.reality.support_x25519mlkem768 === true) return [];

    return [{ tag }];
  });
}
