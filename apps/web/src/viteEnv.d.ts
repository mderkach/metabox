/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Подменять ручку конфига фикстурой. Нужна, пока демон не отдаёт
   * `GET /api/config`: без неё редактор не на чем открыть.
   */
  readonly VITE_METABOX_MOCK_CONFIG?: "true" | "false"
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
