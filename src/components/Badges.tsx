import type { Entry, LightItem } from '../lib/types';
import { ACTION_LABEL, COMPARE_LABEL, LENS_LABEL, actionLabel } from '../lib/types';

const tierClass: Record<string, string> = {
  '极高': 'bg-pine text-paper border-pine',
  '高': 'bg-sand text-pine border-pine/40',
  '一般': 'bg-card text-muted border-line',
};

export function ItemBadges({ item, showLens = true }: { item: LightItem; showLens?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className={`rounded-full border px-2 py-0.5 ${tierClass[item.value]}`}>性价比 {item.value}</span>
      {item.grade && <span className="rounded-full border border-line px-2 py-0.5 text-muted">证据 {item.grade}</span>}
      {showLens && <span className="rounded-full border border-line px-2 py-0.5 text-muted">换{LENS_LABEL[item.tags.lens]}</span>}
      {item.flags.disputed && <span className="rounded-full border border-warn/60 bg-warn/10 px-2 py-0.5 text-warn">有争议</span>}
      {item.flags.todo && <span className="rounded-full border border-warn/60 bg-warn/10 px-2 py-0.5 text-warn">待核实</span>}
    </div>
  );
}

export function StateBadge({ entry, title }: { entry?: Entry; title: string }) {
  if (!entry) return null;
  const bits: string[] = [];
  if (entry.action) bits.push(actionLabel(entry.action, title));
  else if (entry.thoughts.length) bits.push('已写想法');
  if (entry.compare) bits.push(COMPARE_LABEL[entry.compare]);
  if (!bits.length) return null;
  const cls = entry.action === 'done' ? 'bg-teal/15 text-teal border-teal/40' : entry.action === 'na' ? 'text-muted border-line' : 'text-bark border-bark/40';
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>{bits.join(' · ')}</span>;
}

export { ACTION_LABEL };
