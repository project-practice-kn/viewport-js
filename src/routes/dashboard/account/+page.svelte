<script lang="ts">
  import type { PageProps } from './$types';
  import { enhance } from '$app/forms';
  let { form }: PageProps = $props();
  let submitting = $state(false);
</script>

<svelte:head><title>Настройки аккаунта · Viewport</title></svelte:head>
<a class="back-link" href="/dashboard">← Все галереи</a>
<section class="login-panel">
  <h1>Смена пароля</h1>
  {#if form?.message}<p class="feedback" role={form.success ? 'status' : 'alert'}>
      {form.message}
    </p>{/if}
  <form
    method="POST"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        try {
          await update();
        } finally {
          submitting = false;
        }
      };
    }}
  >
    <label
      >Текущий пароль<input
        type="password"
        name="currentPassword"
        autocomplete="current-password"
        required
      /></label
    >
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
      >Повторите новый пароль<input
        type="password"
        name="confirmPassword"
        autocomplete="new-password"
        minlength="10"
        maxlength="128"
        required
      /></label
    >
    <button disabled={submitting}>{submitting ? 'Сохраняем…' : 'Изменить пароль'}</button>
  </form>
</section>
