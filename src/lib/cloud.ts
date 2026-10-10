// 自动备份到用户自己的 GitHub：一个私密 Gist（secret gist，不公开列出，只有知道地址的人能看）。
// 不需要我们的服务器：浏览器直接带用户的密钥调用 GitHub API（该接口支持跨域）。
// 密钥只存在本机，权限只有 gist；导出文件和 Gist 里都不包含密钥。
import { db, getMeta, setMeta } from './db';
import { importBackup, makeBackup, validateBackup } from './backup';

const API = 'https://api.github.com';
const DESC = 'Crosscheck 自动备份（请勿删除）';
const FILE = 'crosscheck-backup.json';
export const TOKEN_URL = `https://github.com/settings/tokens/new?scopes=gist&description=${encodeURIComponent('Crosscheck 自动备份')}`;

export interface CloudState { login: string; gistId: string; lastSaved?: string; lastError?: string }

const gh = async (token: string, path: string, init: RequestInit = {}) => {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (r.status === 401) throw new Error('密钥无效或已过期');
  if (!r.ok) throw new Error(`GitHub 返回 ${r.status}`);
  return r.status === 204 ? null : r.json();
};

async function findGist(token: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const list = await gh(token, `/gists?per_page=100&page=${page}`) as { id: string; description: string; files: Record<string, unknown> }[];
    const hit = list.find(g => g.description === DESC && g.files[FILE]);
    if (hit) return hit.id;
    if (list.length < 100) return null;
  }
  return null;
}

async function readGist(token: string, id: string): Promise<unknown | null> {
  const g = await gh(token, `/gists/${id}`) as { files: Record<string, { content: string; truncated: boolean; raw_url: string }> };
  const f = g.files[FILE];
  if (!f) return null;
  const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  try { return JSON.parse(text); } catch { return null; }
}

const payload = async () => JSON.stringify(await makeBackup(), null, 1);

// 连接：校验密钥 → 找到或新建 Gist → 先把云端记录合并进本机 → 再把合并结果存上去
export async function connect(token: string): Promise<CloudState> {
  token = token.trim();
  const user = await gh(token, '/user') as { login: string };
  let gistId = await findGist(token);
  if (gistId) {
    const data = await readGist(token, gistId);
    const v = validateBackup(data);
    if (v.ok) await importBackup(v.backup, 'merge');
  } else {
    const g = await gh(token, '/gists', { method: 'POST', body: JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content: await payload() } } }) }) as { id: string };
    gistId = g.id;
  }
  await setMeta('ghToken', token);
  const state: CloudState = { login: user.login, gistId };
  await setMeta('cloud', state);
  await push();
  return state;
}

export async function disconnect() {
  await db.meta.bulkDelete(['ghToken', 'cloud']);
}

let pushing: Promise<void> | null = null;
export async function push(): Promise<void> {
  if (pushing) return pushing;
  pushing = (async () => {
    const token = await getMeta<string | null>('ghToken', null);
    const state = await getMeta<CloudState | null>('cloud', null);
    if (!token || !state) return;
    try {
      await gh(token, `/gists/${state.gistId}`, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: await payload() } } }) });
      await setMeta('cloud', { ...state, lastSaved: new Date().toISOString(), lastError: undefined });
    } catch (e) {
      await setMeta('cloud', { ...state, lastError: (e as Error).message });
    }
  })().finally(() => { pushing = null; });
  return pushing;
}

// 打开 App 时：拉一次云端合并（换手机、多设备时用得上）
export async function pullOnStart(): Promise<void> {
  const token = await getMeta<string | null>('ghToken', null);
  const state = await getMeta<CloudState | null>('cloud', null);
  if (!token || !state) return;
  try {
    const v = validateBackup(await readGist(token, state.gistId));
    if (v.ok) await importBackup(v.backup, 'merge');
  } catch { /* 离线时跳过，下次再试 */ }
}
