const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const plural = new Intl.PluralRules('ru');

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${number.format(bytes)} Б`;
  if (bytes < 1048576) return `${number.format(bytes / 1024)} КиБ`;
  if (bytes < 1073741824) return `${number.format(bytes / 1048576)} МиБ`;
  return `${number.format(bytes / 1073741824)} ГиБ`;
}

export function formatPhotos(count: number): string {
  const word = { one: 'фотография', few: 'фотографии', many: 'фотографий', other: 'фотографии' };
  return `${count} ${word[plural.select(count) as keyof typeof word] ?? word.other}`;
}
