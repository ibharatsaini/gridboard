/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public origin of the API (no secrets). Defaults to http://localhost:4000. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
