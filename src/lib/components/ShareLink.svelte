<script lang="ts">
  import { onMount, tick } from 'svelte';
  let { href, compact = false }: { href: string; compact?: boolean } = $props();
  let input = $state<HTMLInputElement>();
  let canCopy = $state(false);
  let copying = $state(false);
  let message = $state('');
  let copied = $state(false);
  let manualOpen = $state(false);
  $effect(() => {
    void href;
    copied = false;
    manualOpen = false;
    message = '';
  });
  onMount(() => {
    canCopy = !!navigator.clipboard?.writeText;
  });

  async function copy() {
    copying = true;
    copied = false;
    try {
      await navigator.clipboard.writeText(href);
      copied = true;
      message = 'Ссылка скопирована. Можно отправить её клиенту.';
    } catch {
      manualOpen = true;
      await tick();
      input?.focus();
      input?.select();
      message = 'Скопируйте выделенную ссылку вручную.';
    } finally {
      copying = false;
    }
  }
</script>

{#if compact}
  <div class="compact-share" class:copied>
    {#if canCopy}<button
        type="button"
        class="compact-copy"
        onclick={copy}
        disabled={copying}
        aria-label="Скопировать ссылку для клиента"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          >{#if copied}<path d="m5 12 4 4L19 6" />{:else}<rect
              x="8"
              y="8"
              width="12"
              height="12"
              rx="2"
            /><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4" />{/if}</svg
        >
        {copying ? 'Копируем…' : copied ? 'Скопировано' : 'Ссылка'}
      </button>{/if}
    {#if !canCopy || manualOpen}<details class="manual-share" bind:open={manualOpen}>
        <summary>Ссылка для клиента</summary><label
          >Скопируйте адрес<input
            bind:this={input}
            readonly
            value={href}
            onclick={(e) => e.currentTarget.select()}
          /></label
        >
      </details>{/if}
    <span class="visually-hidden" role="status">{message}</span>
  </div>
{:else}
  <div class="share-link" class:copied>
    <label
      >Ссылка для клиента<input
        bind:this={input}
        readonly
        value={href}
        onclick={(e) => e.currentTarget.select()}
      /></label
    >
    {#if canCopy}<button type="button" onclick={copy} disabled={copying} class="copy-button"
        ><span aria-hidden="true">{copied ? '✓' : '↗'}</span>
        {copying ? 'Копируем…' : copied ? 'Скопировано' : 'Скопировать ссылку'}</button
      >{/if}
    <p class="muted" role="status">
      {message || 'Клиент сможет смотреть и скачивать фотографии без регистрации.'}
    </p>
  </div>
{/if}
