import type { ConfigChangeLinkProps } from '../model/ConfigApply.link';

export function TestChangeLink({ target, onNavigate, children }: ConfigChangeLinkProps) {
  if (!('rule' in target) && target.section === null) return <span>{children}</span>;

  const destination =
    'rule' in target
      ? `rule-${String(target.rule)}`
      : `${target.section ?? ''}-${target.node === undefined ? '' : String(target.node)}`;
  return (
    <a href={`#${destination}`} onClick={onNavigate}>
      {children}
    </a>
  );
}
