import { screen, waitFor } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { expect } from 'vitest';

type User = ReturnType<typeof userEvent.setup>;

/** Запас нажатий на случай, если гасящее событие пришло раньше отложенного слушателя. */
const OPEN_ATTEMPTS = 3;

/**
 * Открывает выпадающий список и выбирает опцию по её видимому тексту.
 *
 * Открытие приходится готовить. Триггер Base UI вешает одноразовый `mouseup` на
 * документ по таймеру — уже после того, как клик отпустил кнопку, — и ждёт
 * следующего отпускания, чтобы закрыться по нажатию мимо. В браузере это и есть
 * следующее действие пользователя, а в jsdom документ один на файл: слушатель
 * доживает до следующего теста и закрывает там только что открытый список.
 *
 * Выбор — с клавиатуры: клик по опции Base UI обрабатывает по pointer-событиям,
 * которых jsdom не воспроизводит, и значение не меняется.
 */
export async function selectOption(user: User, trigger: HTMLElement, option: string): Promise<void> {
  for (let attempt = 0; attempt < OPEN_ATTEMPTS && screen.queryAllByRole('option').length === 0; attempt += 1) {
    // Перед каждой попыткой: дать сработать таймерам прошлых тестов и погасить
    // то, что они навесили. Слушатели одноразовые, и одно отпускание снимает их
    // разом; своих у закрытого списка ещё нет.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await user.click(trigger);
  }

  await waitFor(() => {
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });

  const options = screen.getAllByRole('option');
  const target = options.find((item) => item.textContent === option);

  if (target === undefined) {
    throw new Error(`Опции «${option}» нет в списке: ${options.map((item) => item.textContent).join(', ')}`);
  }

  // Подсветка отводится в начало списка и двигается по шагу за раз со сверкой
  // после каждого: считать шаги заранее нельзя — начальная подсветка зависит от
  // выбранного значения, а поиск по первым буквам живёт по своему таймеру и под
  // нагрузкой не успевает.
  await user.keyboard('{Home}');

  for (let step = 0; step < options.length && !target.hasAttribute('data-highlighted'); step += 1) {
    await user.keyboard('{ArrowDown}');
  }

  expect(target).toHaveAttribute('data-highlighted');

  await user.keyboard('{Enter}');
}
