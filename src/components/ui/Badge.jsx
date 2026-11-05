export default function Badge({ children, color = 'lime' }) {
  const colors = { lime: 'bg-citrus text-ink', coral: 'bg-coral text-white', dark: 'bg-ink text-cream', soft: 'bg-ink/5 text-ink dark:bg-cream/10 dark:text-cream' };
  return <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.13em] ${colors[color] || colors.soft}`}>{children}</span>;
}
