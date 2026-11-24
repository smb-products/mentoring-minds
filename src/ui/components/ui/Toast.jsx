import { createContext, useCallback, useContext, useState } from 'react';
import { Check, CircleAlert } from 'lucide-react';

const ToastContext = createContext(() => {});

/** toast({ title, description?, tone?: 'success' | 'error', action?: { label, onClick } }) — with an action it stays 7 s. */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children, offsetClass = 'bottom-5' }) {
  const [items, setItems] = useState([]);

  const toast = useCallback((item) => {
    const id = Math.random().toString(36).slice(2);
    setItems((current) => [...current.slice(-2), { id, tone: 'success', ...item }]);
    window.setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), item.action ? 7000 : 3600);
  }, []);
  const dismiss = (id) => setItems((current) => current.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div aria-live="polite" className={`pointer-events-none absolute inset-x-0 ${offsetClass} z-[70] flex flex-col items-center gap-2 px-4`}>
        {items.map((item) => {
          const Icon = item.tone === 'error' ? CircleAlert : Check;
          return (
            <div key={item.id} className={`flex w-full max-w-sm animate-pop items-start gap-2.5 rounded-xl bg-ink px-3.5 py-3 text-ink-foreground shadow-float ${item.action ? 'pointer-events-auto' : ''}`}>
              <Icon size={17} strokeWidth={2.6} aria-hidden className={item.tone === 'error' ? 'mt-px text-critical-soft' : 'mt-px text-good-soft'} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold leading-snug">{item.title}</p>
                {item.description && <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{item.description}</p>}
              </div>
              {item.action && (
                <button type="button" onClick={() => { dismiss(item.id); item.action.onClick(); }} className="-my-1 h-10 shrink-0 rounded-lg bg-ink-foreground/12 px-3.5 text-[14px] font-extrabold text-reward hover:bg-ink-foreground/20">
                  {item.action.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Destructive actions run right away and offer Undo instead of asking "are you sure?".
 * undoable(result, 'Code revoked', () => restore())
 */
export function useUndoToast() {
  const toast = useToast();
  return useCallback(
    (result, title, undo, description) => {
      if (!result.ok) {
        toast({ tone: 'error', title: result.error });
        return null;
      }
      toast({ title, description, action: { label: 'Undo', onClick: async () => { const r = await undo(); toast(r?.ok === false ? { tone: 'error', title: r.error } : { title: 'Undone' }); } } });
      return result.data ?? true;
    },
    [toast],
  );
}

/** Show a Result from an action: toast on failure, return data on success. */
export function useResultToast() {
  const toast = useToast();
  return useCallback(
    (result, successTitle, successDescription) => {
      if (!result.ok) {
        toast({ tone: 'error', title: result.error });
        return null;
      }
      if (successTitle) toast({ title: successTitle, description: successDescription });
      return result.data ?? true;
    },
    [toast],
  );
}
