import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'chapters' }
  | { name: 'chapter'; num: number }
  | { name: 'search' }
  | { name: 'me' }
  | { name: 'item'; id: string }
  | { name: 'duel'; id: string; data: string };

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(query);
  switch (parts[0]) {
    case 'ch': return parts[1] ? { name: 'chapter', num: Number(parts[1]) } : { name: 'chapters' };
    case 'search': return { name: 'search' };
    case 'me': return { name: 'me' };
    case 'item': return { name: 'item', id: decodeURIComponent(parts[1] ?? '') };
    case 'duel': return { name: 'duel', id: decodeURIComponent(parts[1] ?? ''), data: q.get('d') ?? '' };
    default: return { name: 'home' };
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => { setRoute(parseHash(location.hash)); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (hash: string) => { location.hash = hash; };
export const itemHref = (id: string) => `#/item/${encodeURIComponent(id)}`;
