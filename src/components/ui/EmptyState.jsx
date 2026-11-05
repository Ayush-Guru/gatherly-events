import { SearchX } from 'lucide-react';

export default function EmptyState({ title = 'No events found', description = 'Try changing your search or picking another category.' }) {
  return <div className="col-span-full rounded-3xl border border-dashed border-ink/15 bg-ink/[.02] px-6 py-16 text-center dark:border-cream/15 dark:bg-cream/[.03]"><SearchX className="mx-auto mb-4 text-coral" size={32} /><h3 className="font-display text-xl font-semibold">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm text-ink/55 dark:text-cream/55">{description}</p></div>;
}
