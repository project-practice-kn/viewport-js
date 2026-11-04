<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head
  ><title
    >{page.status === 404 ? 'Страница не найдена' : 'Не удалось открыть страницу'} · Viewport</title
  ><meta name="robots" content="noindex" /></svelte:head
>
<section class="error-page">
  <p class="eyebrow">{page.status}</p>
  <h1>{page.status === 404 ? 'Здесь пока пусто.' : 'Не удалось открыть страницу.'}</h1>
  <p class="lede">
    {page.status === 404
      ? 'Проверьте адрес. Если вы открывали галерею по ссылке, уточните у фотографа, доступна ли она.'
      : 'Попробуйте обновить страницу через некоторое время.'}
  </p>
  <a class="back-link" href="/">Вернуться на главную →</a>
</section>
