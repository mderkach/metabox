import { cn } from '../lib/utils';
import { buttonVariants as buttonPrimitiveVariants } from './shadcn/button';

type ButtonVariantProps = Parameters<typeof buttonPrimitiveVariants>[0];

export const BUTTON_SM_TEXT = 'text-xs';
export const BUTTON_PRIMARY_HOVER = 'hover:bg-primary-hover';

/** The vendor `sm` text is 0.8rem (12.8px), off the even type scale; the class overrides it through `cn`. */
export function buttonVariants(props?: ButtonVariantProps): string {
  const { variant = 'default', size, className } = props ?? {};

  return cn(
    buttonPrimitiveVariants({ variant, size }),
    variant === 'default' && BUTTON_PRIMARY_HOVER,
    className,
    size === 'sm' && BUTTON_SM_TEXT
  );
}
