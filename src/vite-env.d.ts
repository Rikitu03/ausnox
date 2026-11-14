/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: 'mock' | 'real'
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
