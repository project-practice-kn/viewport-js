export function setting(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Не задан ${name}`);
  return value;
}
export function limit(name: string, fallback: number): number {
  const value = Number(setting(name, String(fallback)));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Неверный ${name}`);
  return value;
}
export const origin = () => setting('ORIGIN', 'http://localhost:5173');
