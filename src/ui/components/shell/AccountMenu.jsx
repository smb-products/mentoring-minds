import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LogOut, Moon, Sun } from 'lucide-react';
import { signOutNow } from '@/app/(auth)/sign-in/actions';
import { ChangePasswordForm } from '@/components/family/ChangePasswordForm';
import { useAction } from '../../api';
import { live, thrown } from '../../api/live';
import { signingOut } from '../../api/live-hooks';
import { forgetPush } from '../messages/push';
import { useResultToast } from '../ui/Toast';
import { Avatar } from '../ui/Display';
import { Segmented } from '../ui/Form';
import { useShell, useTheme } from './ShellContext';

/** Account panel content (popover on desktop, sheet section on phone). */
export function AccountPanel() {
  const { user } = useShell();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const show = useResultToast();
  const [setTextSize] = useAction(live.families.setTextSize);
  const [changingPassword, setChangingPassword] = useState(false);
  return (
    <div className="w-full">
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <Avatar name={user.name} tone="ink" size="md" />
        <div className="min-w-0">
          <h2 className="truncate text-heading">{user.name}</h2>
          <p className="truncate text-small text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <div className="space-y-3 border-t border-border px-4 py-3">
        <div>
          <p className="mb-1.5 text-small font-medium text-muted-foreground">Appearance</p>
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
          <p className="mb-1.5 text-small font-medium text-muted-foreground">Text size</p>
          <Segmented
            label="Text size"
            size="sm"
            className="w-full"
            value={user.textSize || 'NORMAL'}
            onChange={async (textSize) => {
              // The layout passes the saved size down again from the session.
              if (show(await setTextSize({ textSize }))) router.refresh();
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
        <button
          type="button"
          aria-expanded={changingPassword}
          onClick={() => setChangingPassword((open) => !open)}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-body font-medium text-foreground hover:bg-muted"
        >
          <KeyRound size={16} strokeWidth={1.75} className="text-muted-foreground" aria-hidden />
          Change password
        </button>
        {changingPassword && (
          <div className="px-2.5 pb-2.5 pt-1">
            <ChangePasswordForm />
          </div>
        )}
        <button
          type="button"
          onClick={async () => {
            // The screen's reads end with the session: one that fails from here on shows no error.
            const resume = signingOut();
            // A shared family phone stops getting this parent's alerts. Never blocks signing out.
            await forgetPush({ remove: live.notifications.removePushSubscription });
            try {
              await signOutNow();
            } catch (e) {
              // Signed out: the redirect to the sign-in page arrives as this error, and Next.js handles it.
              if (String(e?.digest ?? '').startsWith('NEXT_REDIRECT')) throw e;
              // Still signed in (no connection, or the app was just updated): the screen carries on.
              resume();
              show(thrown(e));
            }
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-body font-medium text-foreground hover:bg-muted"
        >
          <LogOut size={16} strokeWidth={1.75} className="text-muted-foreground" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );
}
