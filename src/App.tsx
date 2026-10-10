import { useRoute, type Route } from './lib/router';
import { StoreProvider } from './lib/store';
import { Home } from './pages/Home';
import { Chapters, Chapter } from './pages/Chapters';
import { Search } from './pages/Search';
import { Me } from './pages/Me';
import { ItemPage } from './pages/ItemPage';
import { Duel } from './pages/Duel';
import { InstallHint, UpdateBanner, WeChatHint } from './components/Hints';

const TABS: { name: Route['name']; href: string; label: string; match: Route['name'][] }[] = [
  { name: 'home', href: '#/', label: '继续翻', match: ['home'] },
  { name: 'chapters', href: '#/ch', label: '章节', match: ['chapters', 'chapter'] },
  { name: 'search', href: '#/search', label: '搜索', match: ['search'] },
  { name: 'me', href: '#/me', label: '我的', match: ['me'] },
];

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'chapters': return <Chapters />;
    case 'chapter': return <Chapter num={route.num} />;
    case 'search': return <Search />;
    case 'me': return <Me />;
    case 'item': return <ItemPage id={route.id} />;
    case 'duel': return <Duel data={route.data} />;
    default: return <Home />;
  }
}

export default function App() {
  const route = useRoute();
  return (
    <StoreProvider>
      {route.name !== 'duel' && <WeChatHint />}
      <UpdateBanner />
      <header className="mx-auto flex max-w-xl items-baseline justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <a href="#/" className="font-serif text-xl font-semibold tracking-wide text-pine">Crosscheck</a>
        <span className="text-xs text-muted">先想，再对照</span>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-28">
        {route.name === 'home' && <InstallHint />}
        <Page route={route} />
      </main>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl">
          {TABS.map(t => {
            const on = t.match.includes(route.name);
            return <a key={t.name} href={t.href} className={`flex-1 py-3 text-center text-sm ${on ? 'font-semibold text-pine' : 'text-muted'}`}>{t.label}</a>;
          })}
        </div>
      </nav>
    </StoreProvider>
  );
}
