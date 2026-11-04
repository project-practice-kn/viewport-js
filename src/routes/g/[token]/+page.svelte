<script lang="ts">
  import type { PageProps } from './$types';
  import { formatPhotos } from '#lib/format.ts';
  import { onMount } from 'svelte';
  import PhotoSwipeLightbox from 'photoswipe/lightbox';
  import 'photoswipe/style.css';
  let { data }: PageProps = $props();
  let cover = $derived(data.photos.find((p) => p.id === data.coverId));
  let grid: HTMLDivElement;

  onMount(() => {
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
            const photo = data.photos[pswp.currIndex];
            element.textContent = photo
              ? `Фотография ${pswp.currIndex + 1} из ${data.photos.length}: ${photo.filename}`
              : '';
          });
        },
      });
      viewer.ui.registerElement({
        name: 'download-original',
        tagName: 'a',
        appendTo: 'root',
        onInit: (element, pswp) => {
          const link = element as HTMLAnchorElement;
          link.textContent = 'Скачать оригинал ↓';
          pswp.on('change', () => {
            const photo = data.photos[pswp.currIndex];
            if (!photo) return;
            link.href = `/api/downloads/${data.token}/${photo.id}`;
            link.setAttribute('aria-label', `Скачать оригинал ${photo.filename}`);
          });
        },
      });
    });
    lightbox.on('firstUpdate', () => {
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      lightbox.pswp?.element?.setAttribute('aria-label', 'Просмотр фотографий');
      lightbox.pswp?.element?.setAttribute('aria-modal', 'true');
    });
    lightbox.on('destroy', restoreScroll);
    lightbox.init();
    return () => {
      lightbox.destroy();
      restoreScroll();
    };
  });
</script>

<svelte:head
  ><title>{data.title} · Viewport</title><meta
    name="robots"
    content="noindex, nofollow"
  /></svelte:head
>
<div class="public-gallery" class:dark={data.theme === 'dark'}>
  <header class="story-heading">
    <p class="eyebrow">ВАША ФОТОИСТОРИЯ</p>
    <h1>{data.title}</h1>
    {#if data.description}<p class="lede">{data.description}</p>{/if}
    <p class="muted">{formatPhotos(data.photos.length)} · оригиналы в полном качестве</p>
  </header>
  {#if cover}<img
      class="story-cover"
      src={cover.url}
      alt={`Обложка: ${cover.filename}`}
      width={cover.width}
      height={cover.height}
      fetchpriority="high"
    />{/if}
  <div class="photo-grid public-grid" bind:this={grid}>
    {#each data.photos as photo, i (photo.id)}<figure>
        <a
          class="photo-preview"
          href={photo.url}
          target="_blank"
          rel="noreferrer"
          data-pswp-width={photo.width}
          data-pswp-height={photo.height}
          aria-label={`Посмотреть ${photo.filename}`}
          ><img
            src={photo.url}
            alt={photo.filename}
            width={photo.width}
            height={photo.height}
            loading="lazy"
          /></a
        >
        <figcaption>
          <span>{String(i + 1).padStart(2, '0')} / {photo.filename}</span><a
            class="download-link"
            aria-label={`Скачать оригинал ${photo.filename}`}
            href={`/api/downloads/${data.token}/${photo.id}`}>Скачать оригинал ↓</a
          >
        </figcaption>
      </figure>{/each}
  </div>
  <footer class="story-footer">Передано с заботой о деталях <span>VIEWPORT</span></footer>
</div>
