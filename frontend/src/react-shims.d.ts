declare module 'react' {
  export type SetStateAction<T> = T | ((previousState: T) => T)
  export type Dispatch<A> = (value: A) => void

  export type FormEvent<T = Element> = {
    preventDefault(): void
    currentTarget: T
    target: EventTarget & T
  }

  export type DragEvent<T = Element> = {
    preventDefault(): void
    dataTransfer: DataTransfer
    currentTarget: T
    target: EventTarget & T
  }

  export type ChangeEvent<T = Element> = {
    currentTarget: T
    target: EventTarget & T
  }

  export type MouseEvent<T = Element> = {
    currentTarget: T
    target: EventTarget & T
    stopPropagation(): void
  }

  export function startTransition(callback: () => void): void
  export function useDeferredValue<T>(value: T): T
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  export function useEffectEvent<T extends (...args: never[]) => unknown>(callback: T): T
  export function useState<T>(initialState: T | (() => T)): [T, Dispatch<SetStateAction<T>>]

  export const StrictMode: (props: { children?: unknown }) => unknown
}

declare module 'react-dom/client' {
  export type Root = {
    render(children: unknown): void
  }

  export function createRoot(container: Element | DocumentFragment | null): Root
}

declare module 'react/jsx-runtime' {
  export const Fragment: unknown
  export function jsx(type: unknown, props: unknown, key?: unknown): unknown
  export function jsxs(type: unknown, props: unknown, key?: unknown): unknown
}

declare module 'react/jsx-dev-runtime' {
  export const Fragment: unknown
  export function jsxDEV(
    type: unknown,
    props: unknown,
    key?: unknown,
    isStatic?: boolean,
    source?: unknown,
    self?: unknown,
  ): unknown
}

declare namespace JSX {
  interface IntrinsicElements {
    [elementName: string]: Record<string, unknown>
  }
}
