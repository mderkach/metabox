import { buildTagOfType, nodeVariants, type NodeRegistry } from '@entities/Config';

/** Пункт выбора типа узла. */
export interface NodeTypeOption {
  type: string;
  /**
   * Build-тег, которого нет в сборке бинаря: узел такого типа сохранится, но
   * `sing-box check` его отвергнет. `null` — тип запустится или состав сборки
   * не прочитан.
   */
  unbuilt: string | null;
}

/**
 * Типы реестра для выбора, по имени. Тип вне сборки бинаря не выключается, а
 * помечается (AC-47): конфиг собирают и под другой бинарь, а последствие
 * называет пометка. `builtTags` — `null`, пока демон не прочитал бинарь: о
 * составе сборки ничего не известно, и пометок нет.
 */
export function nodeTypeOptions(registry: NodeRegistry, builtTags: readonly string[] | null): NodeTypeOption[] {
  return nodeVariants(registry)
    .map(({ type }) => {
      const tag = buildTagOfType(registry, type);

      return { type, unbuilt: tag !== null && builtTags !== null && !builtTags.includes(tag) ? tag : null };
    })
    .sort((left, right) => left.type.localeCompare(right.type, 'en'));
}
