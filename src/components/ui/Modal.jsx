import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, size = 'max-w-3xl' }) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-ink/75 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal-panel relative max-h-[92vh] w-full ${size} overflow-y-auto rounded-[28px] border border-ink/10 bg-cream shadow-lift dark:border-cream/10 dark:bg-[#19302b]`} role="dialog" aria-modal="true" aria-label={title || 'Dialog'}>
        <button type="button" className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-ink/10 text-ink transition hover:bg-coral hover:text-white dark:bg-cream/10 dark:text-cream" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        {children}
      </section>
    </div>
  );
}
