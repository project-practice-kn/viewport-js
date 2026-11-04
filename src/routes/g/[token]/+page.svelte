<script lang="ts">
  import type { PageProps } from './$types';
  import { formatPhotos } from '#lib/format.ts';
  import { photoViewer } from '#lib/photoViewer.ts';
  let { data }: PageProps = $props();
  let cover = $derived(data.photos.find((p) => p.id === data.coverId));
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
  <div class="photo-grid public-grid" data-downloads="true" use:photoViewer>
    {#each data.photos as photo, i (photo.id)}<figure>
        <a
          class="photo-preview"
          href={photo.url}
          target="_blank"
          rel="noreferrer"
          data-filename={photo.filename}
          data-download={`/api/downloads/${data.token}/${photo.id}`}
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
