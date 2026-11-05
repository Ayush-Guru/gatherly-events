import { useState } from 'react';
import { CalendarDays, Heart, Menu, X, Sparkles, Languages, Plus, UserRound, LogOut } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import ThemeToggle from '../ui/ThemeToggle';
import { translations } from '../../data/translations';
import { useAuth } from '../../context/AuthContext';
import AuthModal from '../auth/AuthModal';

export default function Navbar() {
  const { savedIds, registrations, language, switchLanguage } = useApp();
  const { user, signOut } = useAuth();
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const t = translations[language];
  const links = [{ to: '/explore', label: t.explore }, { to: '/dashboard', label: t.dashboard }, { to: '/organizer', label: t.organizer }];
  const linkClass = ({ isActive }) => `transition hover:text-coral ${isActive ? 'font-bold text-coral' : ''}`;
  return <header className="sticky top-0 z-40 border-b border-ink/10 bg-cream/85 backdrop-blur-xl dark:border-cream/10 dark:bg-ink/85">
    <div className="mx-auto flex h-[74px] w-[min(1180px,calc(100%-32px))] items-center justify-between gap-5">
      <Link to="/" className="group flex items-center gap-2" onClick={() => setOpen(false)}><span className="grid h-9 w-9 rotate-[-8deg] place-items-center rounded-xl bg-citrus text-sm font-black text-ink transition group-hover:rotate-3"><Sparkles size={18} /></span><span className="font-display text-[23px] font-extrabold tracking-[-.08em]">gatherly<span className="text-coral">.</span></span></Link>
      <nav className="hidden items-center gap-7 text-[12px] font-medium text-ink/65 dark:text-cream/65 md:flex" aria-label="Main navigation">{links.map((link) => <NavLink key={link.to} to={link.to} className={linkClass}>{link.label}</NavLink>)}</nav>
      <div className="hidden items-center gap-2 md:flex"><Link to="/dashboard" className="relative grid h-10 w-10 place-items-center rounded-full border border-ink/10 transition hover:border-coral hover:text-coral dark:border-cream/10" aria-label={`${t.saved} events`}><Heart size={16} />{savedIds.length > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-coral px-1 text-[9px] font-bold text-white">{savedIds.length}</span>}</Link><ThemeToggle /><button type="button" onClick={switchLanguage} className="flex h-10 items-center gap-1 rounded-full border border-ink/10 px-3 text-[11px] font-bold dark:border-cream/10" title="Switch language"><Languages size={15} /> {language.toUpperCase()}</button>{user ? <button type="button" onClick={signOut} className="flex h-10 items-center gap-1 rounded-full border border-ink/10 px-3 text-[11px] font-bold dark:border-cream/10" title="Sign out"><LogOut size={14} /> Sign out</button> : <button type="button" onClick={() => setAuthOpen(true)} className="flex h-10 items-center gap-1 rounded-full border border-ink/10 px-3 text-[11px] font-bold dark:border-cream/10"><UserRound size={14} /> Sign in</button>}<Link to="/explore" className="flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-[11px] font-bold text-cream transition hover:-translate-y-0.5 hover:bg-coral dark:bg-citrus dark:text-ink"><CalendarDays size={15} /> Find an event</Link></div>
      <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-ink/10 md:hidden dark:border-cream/10" onClick={() => setOpen((value) => !value)} aria-label="Toggle navigation">{open ? <X size={18} /> : <Menu size={18} />}</button>
    </div>
    {open && <div className="border-t border-ink/10 bg-cream px-4 pb-5 pt-3 dark:border-cream/10 dark:bg-ink md:hidden"><nav className="mx-auto flex max-w-md flex-col gap-1 text-sm">{links.map((link) => <NavLink key={link.to} to={link.to} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center justify-between rounded-xl px-3 py-3 ${isActive ? 'bg-citrus font-bold text-ink' : 'text-ink/70 dark:text-cream/70'}`}>{link.label}<Plus size={15} /></NavLink>)}<div className="mt-3 flex items-center gap-2 border-t border-ink/10 pt-4 dark:border-cream/10"><ThemeToggle /><button type="button" onClick={switchLanguage} className="flex h-10 items-center gap-2 rounded-full border border-ink/10 px-3 text-xs font-bold dark:border-cream/10"><Languages size={15} /> {language === 'en' ? 'हिंदी' : 'English'}</button>{user ? <button type="button" onClick={signOut} className="grid h-10 w-10 place-items-center rounded-full border border-ink/10 dark:border-cream/10" aria-label="Sign out"><LogOut size={15} /></button> : <button type="button" onClick={() => setAuthOpen(true)} className="grid h-10 w-10 place-items-center rounded-full border border-ink/10 dark:border-cream/10" aria-label="Sign in"><UserRound size={15} /></button>}<Link to="/explore" onClick={() => setOpen(false)} className="ml-auto rounded-full bg-ink px-4 py-3 text-xs font-bold text-cream dark:bg-citrus dark:text-ink">Explore events</Link></div></nav></div>}
    <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
  </header>;
}
