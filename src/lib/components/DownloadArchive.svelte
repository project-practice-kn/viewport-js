<script lang="ts">
  import { onMount } from 'svelte';
  import { formatBytes, formatPhotos } from '#lib/format.ts';
  let { href, count, bytes }: { href: string; count: number; bytes: number } = $props();
  let mounted = $state(false),
    errorMessage = $state(''),
    frame = $state<HTMLIFrameElement>();
  onMount(() => {
    mounted = true;
    const receive = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.source === frame?.contentWindow &&
        event.data?.type === 'viewport-download-error'
      )
        errorMessage = event.data.message;
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  });
  function download(event: MouseEvent) {
    if (!mounted || !frame) return;
    event.preventDefault();
    errorMessage = '';
    frame.src = `${href}?embedded=1&attempt=${Date.now()}`;
  }
</script>

<div class="archive-panel">
  <p class="muted">{formatPhotos(count)} · ZIP примерно {formatBytes(bytes)}</p>
  <a class="download-link" {href} onclick={download}>Скачать все фотографии ZIP ↓</a>
  {#if errorMessage}<p role="alert">{errorMessage}</p>{/if}
  <iframe bind:this={frame} title="Скачивание архива" hidden></iframe>
</div>
