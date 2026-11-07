<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  let submitting = $state(false);
</script>

<svelte:head
  ><title>Новый пароль · Viewport</title><meta name="robots" content="noindex" /></svelte:head
>
<section class="login-panel">
  <h1>Новый пароль</h1>
  {#if form?.message}<p class="feedback" role="alert">{form.message}</p>{/if}
  {#if data.invalid || !data.token}<p>Ссылка недействительна. Запросите новую у организатора.</p>
    <a href="/recover">Восстановить доступ</a>{:else}
    <form
      method="POST"
      use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          try {
            await update({ reset: false });
          } finally {
            submitting = false;
          }
        };
      }}
    >
      <input type="hidden" name="token" value={data.token} />
      <label
        >Новый пароль<input
          type="password"
          name="newPassword"
          autocomplete="new-password"
          minlength="10"
          maxlength="128"
          required
        /></label
      >
      <label
        >Повторите пароль<input
          type="password"
          name="confirmPassword"
          autocomplete="new-password"
          minlength="10"
          maxlength="128"
          required
        /></label
      >
      <button disabled={submitting}>{submitting ? 'Сохраняем…' : 'Установить пароль'}</button>
    </form>{/if}
</section>
