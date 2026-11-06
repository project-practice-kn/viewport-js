<script lang="ts">
  import type { PageProps } from './$types';
  import { enhance } from '$app/forms';
  import { formatBytes } from '#lib/format.ts';
  import ShareLink from '#lib/components/ShareLink.svelte';
  import { onMount } from 'svelte';
  let { data, form }: PageProps = $props();
  let creating = $state(false);
  let occupied = $derived(data.usage.used + data.usage.reserved);
  let localDates = $state(false);
  onMount(() => {
    localDates = true;
  });
</script>

<svelte:head><title>Галереи · Viewport</title></svelte:head>
<div class="page-heading">
  <div>
    <p class="eyebrow">КАБИНЕТ / {data.user.name}</p>
    <h1>Ваши галереи<span class="accent">.</span></h1>
  </div>
  <div>
    <a href="/dashboard/account">Настройки аккаунта</a>
    <form method="POST" action="/logout"><button>Выйти</button></form>
  </div>
</div>
<section class="storage-summary" aria-label="Использование хранилища">
  <div class="storage-caption">
    <span>Хранилище оригиналов</span><span
      >{formatBytes(occupied)} из {formatBytes(data.usage.quota)}</span
    >
  </div>
  <meter
    min="0"
    max={data.usage.quota}
    value={Math.min(occupied, data.usage.quota)}
    aria-label="Занятое место с учётом загрузок">{formatBytes(occupied)}</meter
  >
  <p class="muted">
    Оригиналы: {formatBytes(data.usage.used)}{#if data.usage.reserved > 0}
      · загружается: {formatBytes(data.usage.reserved)}{/if}
  </p>
</section>
<section class="create-gallery">
  <h2>Новая история</h2>
  <form
    method="POST"
    aria-busy={creating}
    use:enhance={({ cancel }) => {
      if (creating) {
        cancel();
        return;
      }
      creating = true;
      return async ({ update }) => {
        try {
          await update({ reset: false });
        } finally {
          creating = false;
        }
      };
    }}
  >
    <label
      >Название галереи<input
        name="title"
        placeholder="Например, осенняя прогулка"
        maxlength="120"
        required
        value={form?.title ?? ''}
      /></label
    ><button class="primary" disabled={creating}
      >{creating ? 'Создаём…' : 'Создать галерею ↗'}</button
    >
  </form>
  {#if form?.message}<p class="feedback error" role="alert">{form.message}</p>{/if}
</section>
<section class="gallery-list" aria-labelledby="gallery-list-title">
  <div class="section-heading">
    <h2 id="gallery-list-title">Все галереи</h2>
    <span class="muted">{data.galleries.length}</span>
  </div>
  <form method="GET" class="gallery-filters">
    <label
      >Поиск по названию<input type="search" name="q" value={data.query} maxlength="120" /></label
    >
    <label for="gallery-status">Статус</label><select
      id="gallery-status"
      name="status"
      value={data.status}
      ><option value="">Все галереи</option><option value="draft">Черновики</option><option
        value="published">Опубликованные</option
      ></select
    >
    <label for="gallery-sort">Сортировать</label><select
      id="gallery-sort"
      name="sort"
      value={data.sort}
    >
      <option value="date">По дате изменения</option><option value="name">По названию</option
      ><option value="size">По размеру</option>
    </select>
    <button>Найти</button><a href="/dashboard">Сбросить</a>
  </form>
  {#each data.galleries as gallery, i}<article class="gallery-card">
      <a class="gallery-row" href={`/dashboard/galleries/${gallery.id}`}
        >{#if gallery.coverUrl}<img
            class="dashboard-cover"
            src={gallery.coverUrl}
            alt=""
            width="96"
            height="72"
            loading="lazy"
          />{:else}<span class="dashboard-cover dashboard-cover-empty" aria-hidden="true"
            >{String(i + 1).padStart(2, '0')}</span
          >{/if}
        <h2>{gallery.title}</h2>
        <span class="badge" class:published={gallery.status === 'published'}
          >{gallery.deleting
            ? 'Удаление не завершено'
            : gallery.status === 'draft'
              ? 'Черновик'
              : 'Опубликована'}</span
        ><span aria-hidden="true">↗</span></a
      >
      <p class="muted">
        Фотографий: {gallery.photoCount} · Размер: {formatBytes(gallery.photoBytes)} · Изменена:
        <time datetime={new Date(gallery.updatedAt).toISOString()}
          >{localDates
            ? new Date(gallery.updatedAt).toLocaleString('ru-RU')
            : `${new Date(gallery.updatedAt).toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC`}</time
        >
      </p>
      {#if gallery.link}<a href={gallery.link} target="_blank" rel="noreferrer"
          >Открыть для клиента ↗</a
        ><ShareLink href={gallery.link} />{/if}
    </article>{:else}<p class="empty">
      {#if data.query || data.status}Галереи не найдены. Измените условия поиска.{:else}Здесь
        начнётся ваша первая история.<br />Создайте галерею и добавьте фотографии.{/if}
    </p>{/each}
</section>
