import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { JsonTextarea, type JsonTextareaHandle } from '../JsonTextarea';

const TEXT = '{\n  "tag": "direct"\n}';
const LABEL = 'Узел текстом';

describe('JsonTextarea', () => {
  it('passes every typed character up', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: string) => void>();

    render(<JsonTextarea id='json' label={LABEL} value='' onChange={onChange} />);
    await user.type(screen.getByRole('textbox', { name: LABEL }), '{{');

    expect(onChange).toHaveBeenCalledWith('{');
  });

  it('numbers the lines when wrapping is off and hides the numbers when it is on', () => {
    const { rerender } = render(
      <JsonTextarea id='json' label={LABEL} value={TEXT} onChange={vi.fn<(value: string) => void>()} />
    );

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: LABEL })).toHaveAttribute('wrap', 'off');

    rerender(<JsonTextarea id='json' label={LABEL} value={TEXT} onChange={vi.fn<(value: string) => void>()} wrap />);

    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: LABEL })).toHaveAttribute('wrap', 'soft');
  });

  it('selects a range in the field on request', () => {
    const ref = createRef<JsonTextareaHandle>();
    const at = TEXT.indexOf('"direct"');

    render(<JsonTextarea ref={ref} id='json' label={LABEL} value={TEXT} onChange={vi.fn<(value: string) => void>()} />);
    ref.current?.select(at, '"direct"'.length);

    const input = screen.getByRole('textbox', { name: LABEL });

    expect(input).toHaveFocus();
    expect(input).toHaveProperty('selectionStart', at);
    expect(input).toHaveProperty('selectionEnd', at + '"direct"'.length);
  });
});
