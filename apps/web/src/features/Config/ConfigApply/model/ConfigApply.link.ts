import type { ComponentType, ReactNode } from 'react';

import type { ConfigSection } from '@entities/Config';

export interface ConfigChangeLinkProps {
  target: { rule: number } | { section: ConfigSection | null; node?: number };
  onNavigate: () => void;
  children?: ReactNode;
}

export interface ConfigApplyNavigation {
  ChangeLink: ComponentType<ConfigChangeLinkProps>;
}
