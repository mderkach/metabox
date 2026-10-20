import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { useWriteOnChange } from '../useWriteOnChange';

interface Values {
  name: string;
}

type Write = (values: Values, withRemovals: boolean) => boolean;

function NameForm({ write, isReplaced }: { write: Write; isReplaced: () => boolean }) {
  const form = useForm<Values>({ defaultValues: { name: 'a' } });
  const formRef = useWriteOnChange(form, write, isReplaced);

  return (
    <form ref={formRef}>
      <input aria-label='Name' {...form.register('name')} />
    </form>
  );
}

/** Holds back a removal when the name is emptied without removals allowed, as the config forms do. */
function makeWrite() {
  return vi.fn<Write>((values, withRemovals) => values.name === '' && !withRemovals);
}

describe('useWriteOnChange', () => {
  it('writes each typed change without removals while the field has focus', async () => {
    const write = makeWrite();
    const user = userEvent.setup();

    render(<NameForm write={write} isReplaced={() => false} />);
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'b');

    expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'ab' }), false);
  });

  it('writes a held-back removal when focus leaves the form, not at the erased character', async () => {
    const write = makeWrite();
    const user = userEvent.setup();

    render(<NameForm write={write} isReplaced={() => false} />);
    await user.clear(screen.getByRole('textbox', { name: 'Name' }));

    expect(write).not.toHaveBeenCalledWith(expect.anything(), true);

    await user.tab();

    expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ name: '' }), true);
  });

  it('writes a held-back removal on unmount unless the document was replaced', async () => {
    const write = makeWrite();
    const user = userEvent.setup();
    const kept = render(<NameForm write={write} isReplaced={() => false} />);

    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    kept.unmount();
    await vi.waitFor(() => {
      expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ name: '' }), true);
    });

    const replacedWrite = makeWrite();
    const replaced = render(<NameForm write={replacedWrite} isReplaced={() => true} />);

    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    replaced.unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(replacedWrite).not.toHaveBeenCalledWith(expect.anything(), true);
  });
});
