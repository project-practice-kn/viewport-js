<script lang="ts">
  import { onMount } from 'svelte';
  let { href }: { href: string } = $props();
  let input: HTMLInputElement;
  let canCopy = $state(false);
  let copying = $state(false);
  let message = $state('');
  onMount(() => {
    canCopy = !!navigator.clipboard?.writeText;
  });

  async function copy() {
    copying = true;
    try {
      await navigator.clipboard.writeText(href);
      message = 'Ссылка скопирована. Можно отправить её клиенту.';
    } catch {
      input.focus();
      input.select();
      message = 'Скопируйте выделенную ссылку вручную.';
    } finally {
      copying = false;
    }
  }
</script>

<div class="share-link">
  <label
    >Ссылка для клиента<input
      bind:this={input}
      readonly
      value={href}
      onclick={(e) => e.currentTarget.select()}
    /></label
  >
  {#if canCopy}<button type="button" onclick={copy} disabled={copying}
      >{copying ? 'Копируем…' : 'Скопировать ссылку'}</button
    >{/if}
  <p class="muted" role="status">
    {message || 'Клиент сможет смотреть и скачивать фотографии без регистрации.'}
  </p>
</div>
