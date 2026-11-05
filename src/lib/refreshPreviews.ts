/** Refresh signed preview URLs in an owner-only editor without replacing unsaved form state. */
export function refreshPreviews(
  grid: HTMLElement,
  options: { href: string; onStatus: (message: string) => void },
) {
  let { href, onStatus } = options;
  let last = Date.now(),
    running = false,
    disposed = false,
    problem = '';
  const attempted = new Set<string>();
  const controller = new AbortController();
  function status(message: string) {
    problem = message;
    onStatus(message);
  }
  async function refresh(failed?: string) {
    if (disposed || running) return;
    if (failed && attempted.has(failed)) {
      status('Не удалось загрузить фотографию. Повторите обновление превью.');
      return;
    }
    if (failed) attempted.add(failed);
    running = true;
    try {
      const response = await fetch(href, { cache: 'no-store', signal: controller.signal });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'Состав галереи изменился. Обновите страницу.'
            : 'Не удалось обновить превью. Проверьте соединение.',
        );
      const { photos }: { photos: { id: string; url: string }[] } = await response.json();
      const anchors = [...grid.querySelectorAll<HTMLAnchorElement>('a[data-photo-id]')];
      if (
        photos.length !== anchors.length ||
        photos.some((p, i) => p.id !== anchors[i].dataset.photoId)
      )
        throw new Error('Состав галереи изменился. Обновите страницу.');
      for (const photo of photos) {
        const anchor = anchors.find((a) => a.dataset.photoId === photo.id)!;
        anchor.href = photo.url;
        const img = anchor.querySelector('img');
        if (img) {
          img.src = photo.url + `#refresh-${Date.now()}`;
        }
      }
      last = Date.now();
      status('');
      grid.dispatchEvent(new Event('previews-refreshed'));
    } catch (e) {
      if (!disposed)
        status(
          e instanceof TypeError
            ? 'Не удалось обновить превью. Проверьте соединение.'
            : e instanceof Error
              ? e.message
              : 'Не удалось обновить превью',
        );
    } finally {
      running = false;
    }
  }
  const onError = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'IMG') {
      const id = target.closest<HTMLElement>('a[data-photo-id]')?.dataset.photoId;
      if (id) void refresh(id);
    }
  };
  const onLoad = (event: Event) => {
    const id = (event.target as HTMLElement).closest<HTMLElement>('a[data-photo-id]')?.dataset
      .photoId;
    if (id) attempted.delete(id);
  };
  const onViewerError = (event: Event) => {
    void refresh((event as CustomEvent<string>).detail);
  };
  const onRetry = () => {
    attempted.clear();
    void refresh();
  };
  const check = () => {
    if (!problem && document.visibilityState === 'visible' && Date.now() - last >= 90000)
      void refresh();
  };
  const timer = window.setInterval(check, 10000);
  grid.addEventListener('error', onError, true);
  grid.addEventListener('load', onLoad, true);
  grid.addEventListener('preview-error', onViewerError);
  grid.addEventListener('retry-previews', onRetry);
  document.addEventListener('visibilitychange', check);
  return {
    update(next: { href: string; onStatus: (message: string) => void }) {
      href = next.href;
      onStatus = next.onStatus;
    },
    destroy() {
      disposed = true;
      controller.abort();
      clearInterval(timer);
      grid.removeEventListener('error', onError, true);
      grid.removeEventListener('load', onLoad, true);
      grid.removeEventListener('preview-error', onViewerError);
      grid.removeEventListener('retry-previews', onRetry);
      document.removeEventListener('visibilitychange', check);
    },
  };
}
