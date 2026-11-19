<script lang="ts">
  import { resolveMdiPath } from '../lib/icons';

  let { name = 'view-dashboard', size = 20 }: { name?: string | null; size?: number } = $props();
  let path = $derived(resolveMdiPath(name));
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="currentColor"
  aria-hidden="true"
  style="flex-shrink: 0; display: inline-block;"
>
  <path d={path} />
</svg>
