import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return <button type="button" onClick={toggleTheme} className="grid h-10 w-10 place-items-center rounded-full border border-ink/10 bg-cream/70 text-ink transition hover:-translate-y-0.5 hover:border-coral hover:text-coral dark:border-cream/10 dark:bg-cream/5 dark:text-cream" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title="Toggle theme">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>;
}
