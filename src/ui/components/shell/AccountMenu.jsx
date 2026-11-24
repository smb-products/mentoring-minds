import { LogOut, Moon, Sun } from 'lucide-react';
import { api, useAction } from '../../api';
import { useResultToast, useToast } from '../ui/Toast';
import { Avatar } from '../ui/Display';
import { Segmented } from '../ui/Form';
import { useDemo, useShell } from './ShellContext';

/** Account panel content (popover on desktop, sheet section on phone). */
export function AccountPanel({ onDone }) {
  const { user } = useShell();
  const { userId, setUserId, theme, setTheme } = useDemo();
  const toast = useToast();
  const show = useResultToast();
  const [setTextSize] = useAction(api.families.setTextSize);
  return (
    <div className="w-full">
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <Avatar name={user.name} tone="ink" size="md" />
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-extrabold">{user.name}</h2>
          <p className="truncate text-[13px] text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <div className="space-y-3 border-t border-border px-4 py-3">
        <div>
          <p className="mb-1.5 text-[13px] font-bold text-muted-foreground">Demo account</p>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Demo account">
            {[
              ['u_admin', 'Vienne', 'Tutor'],
              ['u_ana', 'Ana', 'Book homework'],
              ['u_grace', 'Grace', 'Video calls'],
              ['u_monique', 'Monique', 'K–2, no book'],
            ].map(([id, name, hint]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={userId === id}
                onClick={() => {
                  setUserId(id);
                  onDone?.();
                }}
                className={`rounded-[10px] border px-2.5 py-2 text-left ${userId === id ? 'border-primary bg-brand-soft/50' : 'border-border hover:bg-muted'}`}
              >
                <span className="block text-[14px] font-extrabold">{name}</span>
                <span className="block text-[12px] font-semibold text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-bold text-muted-foreground">Appearance</p>
          <Segmented
            label="Appearance"
            size="sm"
            className="w-full"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
            ]}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-bold text-muted-foreground">Text size</p>
          <Segmented
            label="Text size"
            size="sm"
            className="w-full"
            value={user.textSize || 'NORMAL'}
            onChange={async (textSize) => show(await setTextSize({ textSize }))}
            options={[
              { value: 'NORMAL', label: 'Normal' },
              { value: 'LARGE', label: 'Large' },
              { value: 'XLARGE', label: 'Larger' },
            ]}
          />
        </div>
      </div>
      <div className="border-t border-border p-1.5">
        <button
          type="button"
          onClick={() => {
            onDone?.();
            toast({ title: 'Sign-out isn’t part of the prototype', description: 'It returns to the sign-in screen once Auth.js is wired.' });
          }}
          className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[14px] font-bold text-foreground hover:bg-muted"
        >
          <LogOut size={16} strokeWidth={2.2} className="text-muted-foreground" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );
}
