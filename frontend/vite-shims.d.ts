// Type shims for vite and vite plugins when their type packages are unavailable
declare module 'vite' {
  export function defineConfig(config: Record<string, unknown>): Record<string, unknown>
}

declare module '@vitejs/plugin-react' {
  function react(options?: Record<string, unknown>): unknown
  export default react
}
