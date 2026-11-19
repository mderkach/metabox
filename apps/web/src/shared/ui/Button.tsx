import { cn } from '../lib/utils';
import { BUTTON_PRIMARY_HOVER, BUTTON_SM_TEXT } from './Button.lib';
import { Button as ButtonPrimitive } from './shadcn/button';

export function Button({
  className,
  size,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof ButtonPrimitive>) {
  return (
    <ButtonPrimitive
      size={size}
      variant={variant}
      className={cn(variant === 'default' && BUTTON_PRIMARY_HOVER, size === 'sm' && BUTTON_SM_TEXT, className)}
      {...props}
    />
  );
}
