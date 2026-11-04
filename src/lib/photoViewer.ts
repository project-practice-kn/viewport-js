import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';

export function photoViewer(grid: HTMLElement) {
  const failedSlides = new Set<number>();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let previousOverflow: string | undefined;
  const restoreScroll = () => {
    if (previousOverflow !== undefined) {
      document.documentElement.style.overflow = previousOverflow;
      previousOverflow = undefined;
    }
  };
  const lightbox = new PhotoSwipeLightbox({
    gallery: grid,
    children: '.photo-preview',
    pswpModule: () => import('photoswipe'),
    loop: false,
    allowPanToNext: false,
    secondaryZoomLevel: (zoom) => zoom.initial * 2,
    maxZoomLevel: (zoom) => zoom.initial * 4,
    closeTitle: 'Закрыть',
    zoomTitle: 'Увеличить или уменьшить',
    arrowPrevTitle: 'Предыдущая фотография',
    arrowNextTitle: 'Следующая фотография',
    errorMsg: 'Не удалось загрузить фотографию. Обновите страницу и попробуйте снова.',
    showAnimationDuration: reducedMotion.matches ? 0 : 333,
    hideAnimationDuration: reducedMotion.matches ? 0 : 333,
    zoomAnimationDuration: reducedMotion.matches ? 0 : 333,
  });

  lightbox.on('uiRegister', () => {
    const viewer = lightbox.pswp;
    if (!viewer?.ui) return;
    viewer.ui.registerElement({
      name: 'photo-description',
      appendTo: 'root',
      onInit: (element, pswp) => {
        element.setAttribute('aria-live', 'polite');
        element.setAttribute('aria-atomic', 'true');
        pswp.on('change', () => {
          const anchor = pswp.currSlide?.data.element as HTMLElement | undefined;
          element.textContent = anchor
            ? `Фотография ${pswp.currIndex + 1} из ${pswp.getNumItems()}: ${anchor.dataset.filename ?? ''}`
            : '';
        });
      },
    });
    if (grid.dataset.downloads === 'true') {
      viewer.ui.registerElement({
        name: 'download-original',
        tagName: 'a',
        appendTo: 'root',
        onInit: (element, pswp) => {
          const link = element as HTMLAnchorElement;
          link.textContent = 'Скачать оригинал ↓';
          pswp.on('change', () => {
            const anchor = pswp.currSlide?.data.element as HTMLElement | undefined;
            if (!anchor?.dataset.download) return;
            link.href = anchor.dataset.download;
            link.setAttribute('aria-label', `Скачать оригинал ${anchor.dataset.filename ?? ''}`);
          });
        },
      });
    }
  });
  lightbox.on('firstUpdate', () => {
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    lightbox.pswp?.element?.setAttribute('aria-label', 'Просмотр фотографий');
    lightbox.pswp?.element?.setAttribute('aria-modal', 'true');
  });
  lightbox.on('loadComplete', ({ isError, slide }) => {
    if (!slide || grid.dataset.refreshable !== 'true') return;
    const anchor = slide.data.element as HTMLElement | undefined;
    const id = anchor?.dataset.photoId;
    if (!id) return;
    if (isError) failedSlides.add(slide.index);
    grid.dispatchEvent(
      new CustomEvent(isError ? 'preview-error' : 'preview-loaded', { bubbles: true, detail: id }),
    );
  });
  const onRefreshed = () => {
    const viewer = lightbox.pswp;
    if (!viewer) return;
    const indices = [...failedSlides];
    failedSlides.clear();
    for (const index of indices) viewer.refreshSlideContent(index);
  };
  grid.addEventListener('previews-refreshed', onRefreshed);
  lightbox.on('destroy', restoreScroll);
  lightbox.init();
  return {
    destroy() {
      lightbox.destroy();
      grid.removeEventListener('previews-refreshed', onRefreshed);
      restoreScroll();
    },
  };
}
