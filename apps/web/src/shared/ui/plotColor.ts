/**
 * Цвет токена темы для канваса. Канвас CSS-переменные не читает, поэтому
 * значение берётся при каждой отрисовке: смена темы подхватывается
 * перерисовкой, без пересоздания графика.
 */
export function plotColor(token: string, alpha?: number): () => string {
  return function readPlotColor() {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();

    return alpha === undefined || value.includes('/') ? value : value.replace(/\)$/, ` / ${String(alpha)})`);
  };
}
