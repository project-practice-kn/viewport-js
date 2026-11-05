export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/dashboard') || /[\\\r\n]/.test(value)) return '/dashboard';
  try {
    const parsed = new URL(value, 'http://viewport.invalid');
    if (
      parsed.origin !== 'http://viewport.invalid' ||
      !/^\/dashboard(?:\/|$)/.test(parsed.pathname)
    )
      return '/dashboard';
    return parsed.pathname + parsed.search;
  } catch {
    return '/dashboard';
  }
}
