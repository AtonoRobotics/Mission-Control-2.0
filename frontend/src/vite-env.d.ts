/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROSBRIDGE_PORT: string;
  readonly VITE_MC_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
