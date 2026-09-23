/**
 * Счёт графиков панели: доли, шкалы, деления и геометрия. Разметку и цвета
 * держат сами графики.
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

/** Делений на шкале не больше четырёх: подписи в узкой карточке иначе наезжают друг на друга. */
const TICK_INTERVALS = 4;

/** Круглые множители шкалы: 1, 2 и 5 на каждом десятичном разряде. */
const NICE = { One: 1, Two: 2, Five: 5 } as const;
const DECADE = 10;
const DECADES_IN_STAGE = 3;

const BYTE_BASE = 1024;
const BYTE_STAGES = 5;

const NICE_MULTIPLIERS = Array.from({ length: DECADES_IN_STAGE }, (_, decade) =>
  Object.values(NICE).map((multiplier) => multiplier * DECADE ** decade)
).flat();

/**
 * Шаги 1–2–5 внутри каждой ступени килобайта. Десятичные шаги дали бы
 * подписи «97.7 kB» — шкала читается по круглым значениям в тех единицах,
 * которые печатает `formatBytes`.
 */
export const BYTE_STEPS: readonly number[] = Array.from({ length: BYTE_STAGES }, (_, stage) =>
  NICE_MULTIPLIERS.map((multiplier) => multiplier * BYTE_BASE ** stage)
).flat();

export interface ValueScale {
  /** Правая или верхняя кромка шкалы: кратна шагу и не ниже максимума. */
  ceiling: number;
  /** Деления от нуля до кромки включительно. */
  ticks: number[];
}

/**
 * Шкала от нуля: первый шаг, при котором максимум укладывается в заданное
 * число делений. Нулевой максимум даёт шкалу в один наименьший шаг, а не
 * вырожденную.
 */
export function toValueScale(max: number, steps: readonly number[], intervals = TICK_INTERVALS): ValueScale {
  const step = steps.find((candidate) => candidate * intervals >= max) ?? steps[steps.length - 1];
  const count = Math.max(1, Math.ceil(max / step));

  return { ceiling: step * count, ticks: Array.from({ length: count + 1 }, (_, index) => index * step) };
}

/** Запас над пиком ряда без ёмкости: иначе ровный ряд прижимается к верхней кромке. */
const HEADROOM = 1.15;

/**
 * Верх шкалы ряда без осей. С ёмкостью — число ядер, объём памяти — высота
 * говорит, какая часть её занята; ряд, переросший ёмкость, растягивает шкалу
 * до своего пика. Без ёмкости верх — пик с запасом, и график показывает только
 * форму ряда.
 */
export function toSparkCeiling(peak: number, capacity?: number): number {
  return capacity === undefined ? peak * HEADROOM : Math.max(capacity, peak);
}

/** Во сколько раз величина должна упасть, чтобы шкала сжалась. */
const SHRINK_RATIO = 4;

/**
 * Кромка шкалы с запасом на колебания: растёт сразу, как только величина её
 * переросла, а сжимается, лишь когда величина упала вчетверо. Иначе живой
 * ряд, который гуляет вокруг ступени, перерисовывал бы деления каждую секунду
 * и сравнивать кадры между собой было бы нельзя.
 */
export function toStickyCeiling(current: number, needed: number): number {
  if (needed > current || needed * SHRINK_RATIO <= current) {
    return needed;
  }

  return current;
}

export interface TimeWindow {
  min: number;
  max: number;
}

/**
 * Окно оси времени. Левая кромка — первая накопленная точка, пока буфер не
 * заполнен: полная длина окна подписала бы время, за которое данных нет.
 */
export function toTimeWindow(firstAt: number, now: number, span: number): TimeWindow {
  return { min: Math.min(now, Math.max(firstAt, now - span)), max: now };
}

/** Отсечки назад от правой кромки с шагом `step`, пока они внутри окна. */
export function toTimeTicks({ min, max }: TimeWindow, step: number): number[] {
  const count = Math.floor((max - min) / step);

  return Array.from({ length: count + 1 }, (_, index) => max - (count - index) * step);
}

/** Деления шкалы от нуля, отражённые вниз: для двух рядов по разные стороны оси. */
export function toMirroredTicks(ticks: number[]): number[] {
  return [
    ...ticks
      .slice(1)
      .toReversed()
      .map((tick) => -tick),
    ...ticks,
  ];
}
