import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, size = 'max-w-3xl' }) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = previousOverflow; };
  }, [open, onClose]);

  if (!open) return null;
  // A portal avoids fixed-position dialogs being trapped by a transformed or
  // backdrop-filtered navbar. The outer scroller also works on short screens.
  return createPortal(
    <div className="modal-backdrop fixed inset-0 z-[100] overflow-y-auto bg-ink/75 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex min-h-full items-center justify-center" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <section className={`modal-panel relative my-auto w-full ${size} max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-[28px] border border-ink/10 bg-cream shadow-lift dark:border-cream/10 dark:bg-[#19302b]`} role="dialog" aria-modal="true" aria-label={title || 'Dialog'}>
          <button type="button" className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-ink/10 text-ink transition hover:bg-coral hover:text-white dark:bg-cream/10 dark:text-cream" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
          {children}
        </section>
      </div>
    </div>, document.body,
  );
}
