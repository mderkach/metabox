import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { CONFIG_SECTION, isGenericSection } from '@entities/Config';
import type { ConfigChangeLinkProps } from '@features/Config/ConfigApply';

import { configSectionRoute, routeEditorRoute, ruleSetsRoute } from './Router';

const LINK_CLASS =
  'rounded-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

export function ConfigChangeLink({ target, onNavigate, children }: ConfigChangeLinkProps): ReactElement {
  const props = { className: LINK_CLASS, onClick: onNavigate, children };

  if ('rule' in target) {
    return <Link {...props} to={routeEditorRoute.to} search={{ rule: target.rule }} />;
  }

  if (target.section === CONFIG_SECTION.Route) return <Link {...props} to={routeEditorRoute.to} />;
  if (target.section === CONFIG_SECTION.RuleSet)
    return <Link {...props} to={ruleSetsRoute.to} search={{ set: undefined }} />;
  if (target.section !== null && isGenericSection(target.section)) {
    return (
      <Link {...props} to={configSectionRoute.to} params={{ section: target.section }} search={{ node: target.node }} />
    );
  }

  return <span className='font-mono'>{children}</span>;
}
