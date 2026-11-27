import { GripVertical } from 'lucide-react';

export function ReorderGrip({
  label,
  value,
  onStart,
  onEnd,
}: {
  label: string;
  value: string;
  onStart: () => void;
  onEnd: () => void;
}) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- The grip starts native dragging. ReorderButtons supplies equivalent keyboard actions.
    <span
      draggable
      role='img'
      aria-label={label}
      className='cursor-grab text-muted-foreground active:cursor-grabbing'
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', value);
        onStart();
      }}
      onDragEnd={onEnd}
    >
      <GripVertical aria-hidden='true' className='size-4' />
    </span>
  );
}
