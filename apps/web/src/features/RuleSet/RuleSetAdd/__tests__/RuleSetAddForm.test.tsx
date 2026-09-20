import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';

import { RuleSetAddForm } from '../ui/RuleSetAddForm';

const CATALOG_CATEGORY = 'google';
const OFF_CATALOG_CATEGORY = 'mystuff';

describe('форма подключения сета', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  it('предупреждает о категории, которой нет в каталоге', async () => {
    const user = userEvent.setup();

    render(<RuleSetAddForm takenTags={[]} outbounds={[]} />);

    await user.type(screen.getByLabelText('Категория'), OFF_CATALOG_CATEGORY);

    expect(await screen.findByRole('status')).toHaveTextContent('Категории нет в каталоге metabox');
  });

  it('о категории из каталога не предупреждает', async () => {
    const user = userEvent.setup();

    render(<RuleSetAddForm takenTags={[]} outbounds={[]} />);

    await user.type(screen.getByLabelText('Категория'), CATALOG_CATEGORY);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('на своём адресе о категории не судит: каталога у него нет', async () => {
    const user = userEvent.setup();

    render(<RuleSetAddForm takenTags={[]} outbounds={[]} />);

    await user.type(screen.getByLabelText('Категория'), OFF_CATALOG_CATEGORY);
    await user.type(screen.getByLabelText('Адрес сета'), 'https://example.com/list.srs');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
