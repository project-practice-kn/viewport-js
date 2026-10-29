<script lang="ts">
  import type { PageProps } from './$types';
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
    <p class="muted">{data.photos.length} фотографий · оригиналы в полном качестве</p>
  </header>
  {#if cover}<img
      class="story-cover"
      src={cover.url}
      alt={`Обложка: ${cover.filename}`}
      width={cover.width}
      height={cover.height}
    />{/if}
  <div class="photo-grid public-grid">
    {#each data.photos as photo, i}<figure>
        <a
          href={photo.url}
          target="_blank"
          rel="noreferrer"
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
            href={`/api/downloads/${data.token}/${photo.id}`}>Скачать оригинал ↓</a
          >
        </figcaption>
      </figure>{/each}
  </div>
  <footer class="story-footer">Передано с заботой о деталях <span>VIEWPORT</span></footer>
</div>
