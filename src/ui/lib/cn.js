/** Join class names, skipping falsy values. Drop-in for clsx-style usage. */
export function cn(...parts) {
  return parts.flat().filter(Boolean).join(' ');
}
