/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * `"false"` — не подменять ручку конфига фикстурой, ходить к настоящему
   * демону. В разработке подмена включена по умолчанию: `GET /api/config`
   * демон пока не обслуживает. В сборке переменная не действует.
   */
  readonly VITE_METABOX_MOCK_CONFIG?: "false"
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
