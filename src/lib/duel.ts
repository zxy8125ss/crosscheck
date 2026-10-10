// 盲答对质的链接封包。只是压缩，不是加密：拿到链接的人都能解出答案。
import LZString from 'lz-string';

export const MAX_ANSWER = 200;
export const MAX_NAME = 12;

// v = 链接格式版本。改格式时加新版本，旧版本必须仍能解出来
export interface Invite { v: 1; k: 'q'; id: string; a: string; n: string; t: string }
export interface Reply { v: 1; k: 'r'; id: string; a: string; n: string; f: string; fn: string; t: string }
export type Packet = Invite | Reply;

const str = (x: unknown, max: number) => typeof x === 'string' && x.length > 0 && x.length <= max;

export function encode(p: Packet): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(p));
}

export function decode(data: string): Packet | null {
  try {
    const raw = LZString.decompressFromEncodedURIComponent(data);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || p.v !== 1) return null;
    if (!str(p.id, 40) || !str(p.a, MAX_ANSWER) || !str(p.n, MAX_NAME) || typeof p.t !== 'string') return null;
    if (p.k === 'q') return { v: 1, k: 'q', id: p.id, a: p.a, n: p.n, t: p.t };
    if (p.k === 'r' && str(p.f, MAX_ANSWER) && str(p.fn, MAX_NAME)) return { v: 1, k: 'r', id: p.id, a: p.a, n: p.n, f: p.f, fn: p.fn, t: p.t };
    return null;
  } catch {
    return null;
  }
}

export const duelUrl = (p: Packet) => `${location.origin}${location.pathname}#/duel/${encodeURIComponent(p.id)}?d=${encode(p)}`;

export async function shareLink(title: string, text: string, url: string): Promise<'shared' | 'copied' | 'cancelled'> {
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return 'shared'; }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'cancelled';
  }
}
