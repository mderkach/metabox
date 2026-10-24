import { cn } from '../lib/utils';
import { BUTTON_SM_TEXT } from './Button.lib';
import { Button as ButtonPrimitive } from './shadcn/button';

export function Button({ className, size, ...props }: React.ComponentProps<typeof ButtonPrimitive>) {
  return <ButtonPrimitive size={size} className={cn(size === 'sm' && BUTTON_SM_TEXT, className)} {...props} />;
}
