<script lang="ts">
  import { ensureAddonScriptLoaded } from '../lib/addonLoader';
  import type {
    AddonInfo,
    ShellExtensionContribution,
    ShellExtensionHost,
    ShellExtensionSlot,
    ShellHostState
  } from '../types';

  export interface ShellHostBridge {
    getState(): ShellHostState;
    subscribe(listener: (state: ShellHostState) => void): () => void;
    stepDashboard(delta: number): void;
    selectDashboard(id: string): Promise<void>;
    notify(message: string, durationMs?: number): void;
    invokeAction(addonId: string, action: string, payload?: unknown): Promise<unknown>;
  }

  let {
    slot,
    addons,
    host
  }: {
    slot: ShellExtensionSlot;
    addons: AddonInfo[];
    host: ShellHostBridge;
  } = $props();

  let container = $state<HTMLDivElement | null>(null);

  let matchingExtensions = $derived.by(() => {
    const list: { key: string; addonId: string; spec: ShellExtensionContribution }[] = [];
    for (const addon of addons) {
      if (addon.state !== 'enabled') continue;
      for (const spec of addon.contributes.shellExtensions ?? []) {
        const normalizedSlot = spec.slot || 'headless';
        if (normalizedSlot !== slot) continue;
        list.push({
          key: `${addon.id}:${spec.id}:${spec.element.tagName}:${spec.element.script}`,
          addonId: addon.id,
          spec
        });
      }
    }
    return list;
  });

  // Track mounted elements by key so state updates don't unnecessarily remount them.
  const mounted = new Map<string, HTMLElement>();

  $effect(() => {
    const target = container;
    const list = matchingExtensions;
    const bridge = host;
    if (!target) return;

    let cancelled = false;
    const desiredKeys = new Set(list.map((item) => item.key));

    // Remove extensions no longer present
    for (const [key, el] of mounted.entries()) {
      if (!desiredKeys.has(key)) {
        el.remove();
        mounted.delete(key);
      }
    }

    // Load and mount newly added extensions
    for (const item of list) {
      if (mounted.has(item.key)) continue;

      ensureAddonScriptLoaded(item.addonId, item.spec.element.script)
        .then(() => {
          if (cancelled || !target.isConnected || mounted.has(item.key)) return;
          const el = document.createElement(item.spec.element.tagName) as HTMLElement & {
            host?: ShellExtensionHost;
          };
          el.host = {
            addonId: item.addonId,
            extensionId: item.spec.id,
            getState: () => bridge.getState(),
            subscribe: (listener) => bridge.subscribe(listener),
            stepDashboard: (delta) => bridge.stepDashboard(delta),
            selectDashboard: (id) => bridge.selectDashboard(id),
            notify: (message, durationMs) => bridge.notify(message, durationMs),
            invokeAction: (action, payload) => bridge.invokeAction(item.addonId, action, payload)
          };
          mounted.set(item.key, el);
          target.appendChild(el);
        })
        .catch((err) => {
          console.error(`Failed to load shell extension ${item.addonId}:${item.spec.id}`, err);
        });
    }

    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    return () => {
      for (const el of mounted.values()) {
        el.remove();
      }
      mounted.clear();
    };
  });
</script>

{#if slot === 'headless'}
  <div class="shell-slot-headless" bind:this={container} hidden aria-hidden="true"></div>
{:else}
  <div class="shell-slot-inline" bind:this={container}></div>
{/if}

<style>
  .shell-slot-headless {
    display: none;
  }
  .shell-slot-inline {
    display: contents;
  }
</style>
