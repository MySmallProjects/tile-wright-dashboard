<script lang="ts">
  import { resolveIcon } from '../lib/icons';

  let { name = 'view-dashboard', size = 20 }: { name?: string | null; size?: number } = $props();
  let resolved = $derived(resolveIcon(name));
</script>

{#if resolved.kind === 'image'}
  <img
    src={resolved.url}
    alt=""
    width={size}
    height={size}
    loading="lazy"
    aria-hidden="true"
    style="flex-shrink: 0; display: inline-block; object-fit: contain;"
  />
{:else}
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    style="flex-shrink: 0; display: inline-block;"
  >
    <path d={resolved.path} />
  </svg>
{/if}
