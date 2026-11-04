const active = new Map<string, number>();
let total = 0;

export function acquireArchive(galleryId: string, maximum: number) {
  if (total >= maximum) return null;
  total++;
  active.set(galleryId, (active.get(galleryId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    total--;
    const remaining = active.get(galleryId)! - 1;
    if (remaining) active.set(galleryId, remaining);
    else active.delete(galleryId);
  };
}

export const hasActiveArchive = (galleryId: string) => active.has(galleryId);
