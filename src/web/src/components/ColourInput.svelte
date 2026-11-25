<script lang="ts">
  const PRESETS = [
    '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444', '#ec4899',
    '#a855f7', '#6366f1', '#3b82f6', '#38bdf8', '#14b8a6', '#f1f5f9', '#94a3b8'
  ];

  let {
    id,
    value = '',
    placeholder = '#rrggbb',
    allowEmpty = true,
    onchange
  }: {
    id?: string;
    value?: string;
    placeholder?: string;
    allowEmpty?: boolean;
    onchange: (val: string) => void;
  } = $props();

  let wrapEl: HTMLDivElement | undefined = $state();
  let inputEl: HTMLInputElement | undefined = $state();
  let popoverEl: HTMLDivElement | undefined = $state();
  let svEl: HTMLDivElement | undefined = $state();
  let hueEl: HTMLDivElement | undefined = $state();

  let open = $state(false);
  let popTop = $state(0);
  let popLeft = $state(0);

  let h = $state(142);
  let s = $state(0.83);
  let v = $state(0.77);

  function parseHex(raw: string): string | null {
    const trimmed = String(raw ?? '').trim();
    const m6 = /^#?([0-9a-fA-F]{6})$/.exec(trimmed);
    if (m6) return `#${m6[1].toLowerCase()}`;
    const m3 = /^#?([0-9a-fA-F]{3})$/.exec(trimmed);
    if (m3) {
      const [r, g, b] = m3[1].toLowerCase().split('');
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return null;
  }

  function hexToHsv(hex: string): { h: number; s: number; v: number } {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let hue = 0;
    if (d !== 0) {
      if (max === r) hue = ((g - b) / d) % 6;
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }
    const sat = max === 0 ? 0 : d / max;
    return { h: hue, s: sat, v: max };
  }

  function hsvToHex(hue: number, sat: number, val: number): string {
    const c = val * sat;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = val - c;
    let r = 0, g = 0, b = 0;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  const parsedHex = $derived(parseHex(value));

  $effect(() => {
    if (parsedHex) {
      const next = hexToHsv(parsedHex);
      // Preserve hue when saturation or value is 0 so dragging doesn't jump to red.
      if (next.s > 0.001 && next.v > 0.001) {
        h = next.h;
      }
      s = next.s;
      v = next.v;
    }
  });

  function updatePosition() {
    if (!wrapEl) return;
    const rect = wrapEl.getBoundingClientRect();
    const popWidth = 240;
    const popHeight = 264;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < popHeight + 12 && rect.top > popHeight + 12;

    popTop = openAbove
      ? Math.max(8, rect.top - popHeight - 6)
      : Math.min(window.innerHeight - popHeight - 8, rect.bottom + 6);
    popLeft = Math.max(8, Math.min(rect.left, window.innerWidth - popWidth - 8));
  }

  function openPicker() {
    updatePosition();
    open = true;
  }

  function closePicker() {
    open = false;
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  $effect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapEl?.contains(target) || popoverEl?.contains(target)) return;
      closePicker();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePicker();
    };
    const onRelayout = () => updatePosition();

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onRelayout);
    window.addEventListener('scroll', onRelayout, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onRelayout);
      window.removeEventListener('scroll', onRelayout, true);
    };
  });

  function applySv(clientX: number, clientY: number) {
    if (!svEl) return;
    const rect = svEl.getBoundingClientRect();
    const nextS = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextV = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    s = nextS;
    v = nextV;
    onchange(hsvToHex(h, s, v));
  }

  function onSvPointerDown(e: PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    applySv(e.clientX, e.clientY);
  }

  function onSvPointerMove(e: PointerEvent) {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    applySv(e.clientX, e.clientY);
  }

  function applyHue(clientX: number) {
    if (!hueEl) return;
    const rect = hueEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    h = ratio * 360;
    onchange(hsvToHex(h, s, v));
  }

  function onHuePointerDown(e: PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    applyHue(e.clientX);
  }

  function onHuePointerMove(e: PointerEvent) {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    applyHue(e.clientX);
  }

  function handleTextInput(e: Event) {
    onchange((e.currentTarget as HTMLInputElement).value);
  }

  function handleTextBlur() {
    const trimmed = String(value ?? '').trim();
    if (trimmed === '') {
      if (allowEmpty) onchange('');
      return;
    }
    const normalized = parseHex(trimmed);
    if (normalized && normalized !== value) {
      onchange(normalized);
    }
  }

  function pickPreset(hex: string) {
    onchange(hex);
  }

  function clearColour() {
    onchange('');
  }
</script>

<div class="colour-input-wrap" bind:this={wrapEl}>
  <button
    type="button"
    class="swatch-btn"
    class:is-empty={!parsedHex}
    style={parsedHex ? `background: ${parsedHex};` : undefined}
    title="Pick colour"
    aria-label="Open colour picker"
    onmousedown={(e) => e.preventDefault()}
    onclick={() => {
      if (open) closePicker();
      else {
        inputEl?.focus();
        openPicker();
      }
    }}
  ></button>
  <input
    bind:this={inputEl}
    {id}
    type="text"
    class="hex-input"
    value={value ?? ''}
    {placeholder}
    autocomplete="off"
    spellcheck="false"
    onfocus={openPicker}
    onclick={openPicker}
    oninput={handleTextInput}
    onblur={handleTextBlur}
  />
</div>

{#if open}
  <div
    class="colour-popover"
    use:portal
    bind:this={popoverEl}
    style={`top: ${popTop}px; left: ${popLeft}px;`}
    role="dialog"
    aria-label="Colour picker"
    tabindex="-1"
    onmousedown={(e) => e.preventDefault()}
  >
    <div
      class="sv-plane"
      bind:this={svEl}
      role="slider"
      tabindex="-1"
      aria-label="Saturation and brightness"
      aria-valuenow={Math.round(v * 100)}
      style={`background-color: hsl(${h}, 100%, 50%);`}
      onpointerdown={onSvPointerDown}
      onpointermove={onSvPointerMove}
    >
      <div class="sv-white"></div>
      <div class="sv-black"></div>
      <div
        class="sv-thumb"
        style={`left: ${(s * 100).toFixed(2)}%; top: ${((1 - v) * 100).toFixed(2)}%;`}
      ></div>
    </div>

    <div
      class="hue-bar"
      bind:this={hueEl}
      role="slider"
      tabindex="-1"
      aria-label="Hue"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(h)}
      onpointerdown={onHuePointerDown}
      onpointermove={onHuePointerMove}
    >
      <div
        class="hue-thumb"
        style={`left: ${((h / 360) * 100).toFixed(2)}%;`}
      ></div>
    </div>

    <div class="presets">
      {#each PRESETS as hex (hex)}
        <button
          type="button"
          class="preset-btn"
          class:active={parsedHex === hex}
          style={`background: ${hex};`}
          title={hex}
          aria-label={`Select ${hex}`}
          onclick={() => pickPreset(hex)}
        ></button>
      {/each}
    </div>

    <div class="popover-footer">
      <span class="hex-readout">{parsedHex ?? 'None'}</span>
      <div class="footer-btns">
        {#if allowEmpty && value}
          <button type="button" class="mini-btn" onclick={clearColour}>Clear</button>
        {/if}
        <button type="button" class="mini-btn primary" onclick={closePicker}>Done</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .colour-input-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .swatch-btn {
    width: 30px;
    height: 30px;
    padding: 0;
    flex-shrink: 0;
    border-radius: 6px;
    border: 1px solid var(--tw-border);
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }
  .swatch-btn.is-empty {
    background:
      linear-gradient(135deg, transparent 45%, var(--tw-state-critical) 46%, var(--tw-state-critical) 54%, transparent 55%),
      var(--tw-surface-solid);
  }
  .hex-input {
    flex: 1;
    min-width: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  .colour-popover {
    position: fixed;
    z-index: 9999;
    width: 240px;
    padding: 10px;
    border-radius: 12px;
    background: var(--tw-surface-solid);
    border: 1px solid var(--tw-border);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    gap: 10px;
    user-select: none;
  }
  .sv-plane {
    position: relative;
    width: 100%;
    height: 126px;
    border-radius: 8px;
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
    border: 1px solid var(--tw-border);
  }
  .sv-white {
    position: absolute;
    inset: 0;
    background: linear-gradient(to right, #ffffff, rgba(255, 255, 255, 0));
  }
  .sv-black {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, #000000, rgba(0, 0, 0, 0));
  }
  .sv-thumb {
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: 2px solid #ffffff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.65);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .hue-bar {
    position: relative;
    width: 100%;
    height: 14px;
    border-radius: 999px;
    background: linear-gradient(
      to right,
      #ff0000 0%,
      #ffff00 17%,
      #00ff00 33%,
      #00ffff 50%,
      #0000ff 67%,
      #ff00ff 83%,
      #ff0000 100%
    );
    cursor: ew-resize;
    touch-action: none;
  }
  .hue-thumb {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: #ffffff;
    border: 2px solid #0f172a;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .presets {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px;
  }
  .preset-btn {
    width: 100%;
    aspect-ratio: 1;
    padding: 0;
    min-width: 0;
    min-height: 0;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
  }
  .preset-btn.active {
    outline: 2px solid var(--tw-text);
    outline-offset: 1px;
  }
  .popover-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .hex-readout {
    font-size: 0.78rem;
    color: var(--tw-text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  .footer-btns {
    display: flex;
    gap: 6px;
  }
  .mini-btn {
    padding: 4px 10px;
    font-size: 0.78rem;
    min-height: 0;
  }
</style>
