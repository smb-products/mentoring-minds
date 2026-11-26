import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LogOut, Moon, Sun } from 'lucide-react';
import { signOutNow } from '@/app/(auth)/sign-in/actions';
import { ChangePasswordForm } from '@/components/family/ChangePasswordForm';
import { api, useAction } from '../../api';
import { live } from '../../api/live';
import { forgetPush } from '../messages/push';
import { useResultToast, useToast } from '../ui/Toast';
import { Avatar } from '../ui/Display';
import { Segmented } from '../ui/Form';
import { useDemo, useShell } from './ShellContext';

/** Account panel content (popover on desktop, sheet section on phone). */
export function AccountPanel({ onDone }) {
  const { user } = useShell();
  const { isDemo, userId, setUserId, theme, setTheme } = useDemo();
  const router = useRouter();
  const toast = useToast();
  const show = useResultToast();
  // The account's own setting: real even while `families` is on the mock (demo mode keeps the mock).
  const [setTextSize] = useAction(isDemo ? api.families.setTextSize : live.families.setTextSize);
  const [changingPassword, setChangingPassword] = useState(false);
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
        {isDemo && (
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
        )}
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
            onChange={async (textSize) => {
              // The layout passes the saved size down again from the session.
              if (show(await setTextSize({ textSize })) && !isDemo) router.refresh();
            }}
            options={[
              { value: 'NORMAL', label: 'Normal' },
              { value: 'LARGE', label: 'Large' },
              { value: 'XLARGE', label: 'Larger' },
            ]}
          />
        </div>
      </div>
      <div className="border-t border-border p-1.5">
        {!isDemo && (
          <>
            <button
              type="button"
              aria-expanded={changingPassword}
              onClick={() => setChangingPassword((open) => !open)}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[14px] font-bold text-foreground hover:bg-muted"
            >
              <KeyRound size={16} strokeWidth={2.2} className="text-muted-foreground" aria-hidden />
              Change password
            </button>
            {changingPassword && (
              <div className="px-2.5 pb-2.5 pt-1">
                <ChangePasswordForm />
              </div>
            )}
          </>
        )}
        <button
          type="button"
          onClick={async () => {
            if (isDemo) {
              onDone?.();
              toast({ title: 'Sign-out is off in the demo', description: 'It returns to the sign-in screen when sign-in is on.' });
              return;
            }
            // A shared family phone stops getting this parent's alerts. Never blocks signing out.
            await forgetPush({ remove: live.notifications.removePushSubscription });
            await signOutNow();
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
