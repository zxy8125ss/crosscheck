/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
declare module '*/shared/search.js' {
  export function search<T>(items: T[], query: string): T[];
  export function parseQuery(q: string): string[];
}
