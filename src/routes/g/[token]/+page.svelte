<script lang="ts">
  import type { PageProps } from './$types';
  import { formatPhotos } from '#lib/format.ts';
  import { photoViewer } from '#lib/photoViewer.ts';
  import { onMount, tick, untrack } from 'svelte';
  let { data }: PageProps = $props();
  let urls = $state<Record<string, string>>({});
  let problem = $state<'network' | 'image' | 'unavailable' | 'changed' | null>(null);
  let refreshing = $state(false);
  let grid = $state<HTMLDivElement>();
  let cover = $derived(data.photos.find((p) => p.id === data.coverId));
  let lastRefresh = Date.now();
  const retriedImages = new Set<string>();
  const failedImages = new Map<string, HTMLImageElement>();
  let retryVersion = 0;
  let disposed = false;
  let controller: AbortController;
  let currentToken = untrack(() => data.token);

  $effect(() => {
    if (currentToken !== data.token) {
      currentToken = data.token;
      controller?.abort();
      urls = {};
      problem = null;
      retriedImages.clear();
      failedImages.clear();
      lastRefresh = Date.now();
    }
  });

  async function refreshPreviews(failedImage?: string) {
    if (disposed || problem === 'unavailable' || problem === 'changed') return;
    if (refreshing) {
      if (failedImage) retriedImages.add(failedImage);
      return;
    }
    if (failedImage && retriedImages.has(failedImage)) {
      problem = 'image';
      return;
    }
    if (failedImage) retriedImages.add(failedImage);
    refreshing = true;
    controller = new AbortController();
    const token = data.token;
    try {
      const response = await fetch(`/g/${token}/previews`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (disposed || token !== data.token) return;
      if (response.status === 404) {
        problem = 'unavailable';
        return;
      }
      if (response.status === 409) {
        problem = 'changed';
        return;
      }
      if (!response.ok) throw new Error('Не удалось обновить фотографии');
      const result: { photos: { id: string; url: string }[] } = await response.json();
      if (disposed || token !== data.token) return;
      if (
        result.photos.length !== data.photos.length ||
        result.photos.some((photo, i) => photo.id !== data.photos[i].id)
      ) {
        problem = 'changed';
        return;
      }
      urls = Object.fromEntries(result.photos.map((photo) => [photo.id, photo.url]));
      lastRefresh = Date.now();
      problem = null;
      await tick();
      for (const [key, image] of failedImages) {
        if (!image.isConnected) {
          failedImages.delete(key);
          continue;
        }
        retriedImages.add(key);
        if (image.complete && image.naturalWidth === 0) {
          const src = image.getAttribute('src');
          if (src) {
            // Fragments are not sent to S3, so its signature stays intact.
            // A distinct fragment also prevents the browser reusing a failed image.
            const url = new URL(src, window.location.href);
            url.hash = `viewport-retry-${++retryVersion}`;
            image.src = url.href;
          }
        }
      }
      grid?.dispatchEvent(new Event('previews-refreshed'));
    } catch {
      if (!disposed && token === data.token) problem = 'network';
    } finally {
      refreshing = false;
    }
  }

  function imageError(key: string, image: HTMLImageElement) {
    failedImages.set(key, image);
    void refreshPreviews(key);
  }

  function imageLoaded(key: string, image: HTMLImageElement) {
    if (failedImages.get(key) === image) failedImages.delete(key);
    retriedImages.delete(key);
  }

  function retry() {
    retriedImages.clear();
    problem = null;
    void refreshPreviews();
  }

  onMount(() => {
    const onViewerError = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id) void refreshPreviews(`viewer:${id}`);
    };
    const onViewerLoad = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id) retriedImages.delete(`viewer:${id}`);
    };
    window.addEventListener('preview-error', onViewerError);
    window.addEventListener('preview-loaded', onViewerLoad);
    const timer = window.setInterval(() => {
      if (
        !problem &&
        document.visibilityState === 'visible' &&
        Date.now() - lastRefresh >= 90_000
      ) {
        void refreshPreviews();
      }
    }, 10_000);
    const onVisible = () => {
      if (
        !problem &&
        document.visibilityState === 'visible' &&
        Date.now() - lastRefresh >= 90_000
      ) {
        void refreshPreviews();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener('preview-error', onViewerError);
      window.removeEventListener('preview-loaded', onViewerLoad);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
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
    <form method="POST" action="?/theme">
      <input type="hidden" name="theme" value={data.theme === 'dark' ? 'light' : 'dark'} />
      <button type="submit">{data.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</button>
    </form>
  </header>
  {#if problem === 'unavailable' || problem === 'changed'}
    <div class="feedback" role="alert">
      {#if problem === 'unavailable'}
        Галерея больше недоступна. Обратитесь к фотографу.
      {:else}
        Состав галереи изменился. <a href={`/g/${data.token}`}>Обновить страницу</a>.
      {/if}
    </div>
  {:else}
    {#if problem === 'network' || problem === 'image'}
      <div class="feedback" role="alert">
        <p>
          {problem === 'network'
            ? 'Не удалось обновить фотографии. Проверьте соединение.'
            : 'Не удалось загрузить фотографию.'}
        </p>
        <button type="button" onclick={retry} disabled={refreshing}>Попробовать снова</button>
      </div>
    {/if}
    {#if cover}<img
        class="story-cover"
        src={urls[cover.id] ?? cover.url}
        alt={`Обложка: ${cover.filename}`}
        width={cover.width}
        height={cover.height}
        fetchpriority="high"
        onerror={(event) =>
          imageError(`cover:${cover.id}`, event.currentTarget as HTMLImageElement)}
        onload={(event) =>
          imageLoaded(`cover:${cover.id}`, event.currentTarget as HTMLImageElement)}
      />{/if}
    <div
      class="photo-grid public-grid"
      data-downloads="true"
      data-refreshable="true"
      bind:this={grid}
      use:photoViewer
    >
      {#each data.photos as photo, i (photo.id)}<figure>
          <a
            class="photo-preview"
            href={urls[photo.id] ?? photo.url}
            target="_blank"
            rel="noreferrer"
            data-filename={photo.filename}
            data-photo-id={photo.id}
            data-download={`/api/downloads/${data.token}/${photo.id}`}
            data-pswp-width={photo.width}
            data-pswp-height={photo.height}
            aria-label={`Посмотреть ${photo.filename}`}
            ><img
              src={urls[photo.id] ?? photo.url}
              alt={photo.filename}
              width={photo.width}
              height={photo.height}
              loading="lazy"
              onerror={(event) =>
                imageError(`grid:${photo.id}`, event.currentTarget as HTMLImageElement)}
              onload={(event) =>
                imageLoaded(`grid:${photo.id}`, event.currentTarget as HTMLImageElement)}
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
  {/if}
  <footer class="story-footer">Передано с заботой о деталях <span>VIEWPORT</span></footer>
</div>
