import { z } from 'zod';

/** Коды отказа формы добавления узла: текст по ним подставляет `ui`. */
export const NODE_ADD_ERROR = {
  TypeRequired: 'typeRequired',
  TagRequired: 'tagRequired',
  TagTaken: 'tagTaken',
} as const;

/** Что спрашивает форма добавления: остальные поля правятся уже формой узла. */
export const NodeAddSchema = z.object({
  /** Тип узла из реестра секции */
  type: z.string(),
  /** Имя узла: по нему на узел ссылаются правила и другие узлы */
  tag: z.string(),
});

export type NodeAddModel = z.infer<typeof NodeAddSchema>;

/** Форма открывается без типа: выбор типа — первый осознанный шаг, а не значение по умолчанию. */
export const NODE_ADD_DEFAULTS: NodeAddModel = { type: '', tag: '' };

/**
 * Схема с проверкой, зависящей от документа: занятые теги приходят снаружи.
 * Тег — ссылка, по которой на узел указывают правила и `detour`, и второй узел
 * с тем же именем сделал бы её двусмысленной.
 */
export function makeNodeAddSchema(takenTags: readonly string[]) {
  const taken = new Set(takenTags);

  return NodeAddSchema.superRefine((data, ctx) => {
    if (data.type === '') {
      ctx.addIssue({ code: 'custom', path: ['type'], message: NODE_ADD_ERROR.TypeRequired });
    }

    const tag = data.tag.trim();

    if (tag === '') {
      ctx.addIssue({ code: 'custom', path: ['tag'], message: NODE_ADD_ERROR.TagRequired });
    } else if (taken.has(tag)) {
      ctx.addIssue({ code: 'custom', path: ['tag'], message: NODE_ADD_ERROR.TagTaken });
    }
  });
}
