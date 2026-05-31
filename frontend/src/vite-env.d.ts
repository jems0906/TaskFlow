/// <reference types="vite/client" />

// Fallback if vite/client types are not available
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  [key: string]: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
