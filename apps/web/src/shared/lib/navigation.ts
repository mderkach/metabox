import type { LinkProps } from '@tanstack/react-router';

export type StaticPagePath = Exclude<Extract<NonNullable<LinkProps['to']>, `/${string}`>, `${string}$${string}`>;

export type PageLink = Required<Pick<LinkProps, 'to'>> & Pick<LinkProps, 'params' | 'search'>;
