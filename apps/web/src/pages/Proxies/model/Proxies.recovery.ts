import {
  isNodeRecognized,
  NODE_REGISTRY,
  readSectionNodes,
  supportsVlessRealityHybridKeyShare,
} from '@entities/Config';
import { DELAY_STATE, type ProxyNode } from '@entities/Proxy';
import { isRecord } from '@shared/lib/isRecord';

interface RealityRecoveryHint {
  tag: string;
  editIndex?: number;
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

export function realityRecoveryHints(
  applied: string | undefined,
  draft: string | null,
  failed: ReadonlySet<string>,
  runtime: readonly ProxyNode[]
): RealityRecoveryHint[] {
  if (applied === undefined || failed.size === 0 || !supportsVlessRealityHybridKeyShare()) return [];

  const nodes = readSectionNodes(applied, 'outbounds');
  const positions = editablePositions(nodes);
  const editPositions = draft === null ? positions : editablePositions(readSectionNodes(draft, 'outbounds'));

  return runtime.flatMap(({ name: tag, type, delayState }) => {
    if (type.toLowerCase() !== 'vless' || delayState !== DELAY_STATE.Failed || !failed.has(tag)) return [];

    const index = positions.get(tag);
    if (index === undefined) return [];

    const node = nodes[index];
    if (!isRecord(node) || !isRecord(node.tls) || !isRecord(node.tls.reality)) return [];
    if (node.tls.reality.support_x25519mlkem768 === true) return [];

    const editIndex = editPositions.get(tag);

    return [{ tag, editIndex }];
  });
}
