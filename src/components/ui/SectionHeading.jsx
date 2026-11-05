export default function SectionHeading({ eyebrow, title, description, action }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
    <div><p className="mb-3 text-[11px] font-bold uppercase tracking-[.2em] text-coral">{eyebrow}</p><h2 className="font-display text-3xl font-semibold tracking-[-.06em] text-ink dark:text-cream sm:text-4xl lg:text-[46px]">{title}</h2>{description && <p className="mt-3 max-w-xl text-sm leading-7 text-ink/60 dark:text-cream/60">{description}</p>}</div>
    {action}
  </div>;
}
