import { useEffect, useState } from 'react';

/**
 * useState that remembers its value in localStorage (per browser, per user).
 * Used only for UI conveniences such as the collapsed sidebar. Fails safely
 * when storage is unavailable.
 */
export function useStoredState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: keep in memory only */
    }
  }, [key, value]);

  return [value, setValue];
}
