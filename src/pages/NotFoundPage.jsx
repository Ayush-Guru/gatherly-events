import { Link } from 'react-router-dom';

export default function NotFoundPage() { return <main className="mx-auto min-h-[70vh] w-[min(1180px,calc(100%-32px))] py-32 text-center"><p className="text-[11px] font-bold uppercase tracking-[.2em] text-coral">404 / Wrong turn</p><h1 className="mt-4 font-display text-6xl font-semibold tracking-[-.09em]">Nothing here<br /><span className="serif text-coral">yet.</span></h1><Link to="/" className="mt-8 inline-flex rounded-full bg-ink px-5 py-3 text-xs font-bold text-cream dark:bg-citrus dark:text-ink">Back to Gatherly</Link></main>; }
