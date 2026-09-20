/**
 * Геометрия графиков панели. Библиотеки нет намеренно: рядов немного, они без
 * интерактива, и сто килобайт в бандле за них не отдаются: панель открывается
 * с устройства. Здесь только счёт координат, разметку и цвета держат сами
 * графики.
 */

/** По одной точке линию не проведёшь. */
const MIN_POINTS = 2;

/** Сотые доли области: площадь всё равно растягивается по месту. */
const COORD_PRECISION = 2;

const FULL_TURN = 360;

export interface AreaGeometry {
  /** Точки для `polyline`. */
  line: string;
  /** Замкнутый контур под линией для заливки. */
  area: string;
}

/** Доля от суммы; нулевая сумма даёт ноль, а не `NaN`. */
export function toShare(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

/**
 * Ряд от нулевой линии вверх. Пик задаётся снаружи: у соседних графиков он
 * общий, и посчитанный внутри развёл бы им шкалы.
 */
export function toAreaGeometry(values: number[], peak: number, width: number, height: number): AreaGeometry | null {
  if (values.length < MIN_POINTS) {
    return null;
  }

  const step = width / (values.length - 1);
  const points = values.map((value, index) => {
    const y = height * (1 - toShare(value, peak));

    return `${(step * index).toFixed(COORD_PRECISION)},${y.toFixed(COORD_PRECISION)}`;
  });

  return {
    line: points.join(' '),
    area: `M0,${String(height)} L${points.join(' L')} L${String(width)},${String(height)} Z`,
  };
}

const PERCENT = 100;

/**
 * Доли целыми процентами, в сумме ровно сто. Округление каждой доли по
 * отдельности даёт 88 и 13 на сводке из двух групп — метод наибольшего
 * остатка отдаёт разницу тем, у кого она крупнее.
 */
export function toPercents(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);

  // Без этой ветки пустая сводка раздала бы все сто процентов нулевым долям.
  if (total === 0) {
    return values.map(() => 0);
  }

  const exact = values.map((value) => toShare(value, total) * PERCENT);
  const floors = exact.map((value) => Math.floor(value));
  const spare = PERCENT - floors.reduce((sum, value) => sum + value, 0);
  const remainders = exact.map((value, index) => value - floors[index]);

  const order = new Set(
    [...remainders.keys()].sort((left, right) => remainders[right] - remainders[left]).slice(0, Math.max(0, spare))
  );

  return floors.map((value, index) => (order.has(index) ? value + 1 : value));
}

export interface DonutSegment {
  /** Значение `stroke-dasharray`: длина дуги и остаток окружности. */
  dash: string;
  /** Поворот начала дуги в градусах — им сегменты встают друг за другом. */
  turn: number;
}

/**
 * Кольцо из долей одной окружностью на сегмент. Дуги рисуются штрихом, а не
 * путями через `arc`: у штриха доля — это длина, и её не приходится считать
 * тригонометрией на каждый сегмент.
 */
export function toDonutSegments(values: number[], circumference: number): DonutSegment[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  let passed = 0;

  return values.map((value) => {
    const share = toShare(value, total);
    const turn = passed * FULL_TURN;

    passed += share;

    return {
      dash: `${(circumference * share).toFixed(COORD_PRECISION)} ${circumference.toFixed(COORD_PRECISION)}`,
      turn,
    };
  });
}
