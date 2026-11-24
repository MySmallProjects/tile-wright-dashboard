<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import type { SelectOptionSpec, SettingsFieldSchema } from '../types';
  import Icon from './Icon.svelte';
  import IconPicker from './IconPicker.svelte';

  let {
    schema,
    addonId,
    initialValues = {},
    secretsSet = {},
    submitLabel = 'Save',
    saving = false,
    onSubmit,
    onCancel
  }: {
    schema: SettingsFieldSchema[];
    addonId?: string;
    initialValues?: Record<string, unknown>;
    secretsSet?: Record<string, boolean>;
    submitLabel?: string;
    saving?: boolean;
    onSubmit: (values: Record<string, unknown>, secrets: Record<string, string | null>) => void;
    onCancel?: () => void;
  } = $props();

  function buildInitialValues(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of schema) {
      if (f.type === 'secret') continue;
      if (initialValues && initialValues[f.key] !== undefined) {
        out[f.key] = structuredClone($state.snapshot(initialValues[f.key]));
      } else if (f.defaultValue !== undefined) {
        out[f.key] = structuredClone($state.snapshot(f.defaultValue));
      } else if (f.type === 'toggle') {
        out[f.key] = false;
      } else if (f.type === 'group') {
        out[f.key] = [];
      } else if (f.type === 'colour') {
        out[f.key] = '#2563eb';
      } else {
        out[f.key] = '';
      }
    }
    return out;
  }

  let values = $state<Record<string, unknown>>(buildInitialValues());
  let secretDrafts = $state<Record<string, string>>({});
  let clearedSecrets = $state<Record<string, boolean>>({});
  let dynamicOptions = $state<Record<string, SelectOptionSpec[]>>({});
  let errors = $state<Record<string, string>>({});

  onMount(async () => {
    if (!addonId) return;
    for (const field of schema) {
      if (field.type === 'select' && field.dynamicOptionsEndpoint) {
        try {
          dynamicOptions[field.key] = await api.getDynamicOptions(addonId, field.dynamicOptionsEndpoint);
        } catch {
          dynamicOptions[field.key] = [];
        }
      }
    }
  });

  function addGroupRow(field: SettingsFieldSchema) {
    const list = Array.isArray(values[field.key]) ? [...(values[field.key] as Record<string, unknown>[])] : [];
    const row: Record<string, unknown> = {};
    for (const sub of field.fields ?? []) {
      row[sub.key] = sub.defaultValue ?? (sub.type === 'toggle' ? false : sub.type === 'colour' ? '#2563eb' : '');
    }
    list.push(row);
    values[field.key] = list;
  }

  function removeGroupRow(fieldKey: string, idx: number) {
    const list = Array.isArray(values[fieldKey]) ? [...(values[fieldKey] as Record<string, unknown>[])] : [];
    list.splice(idx, 1);
    values[fieldKey] = list;
  }

  function updateGroupCell(fieldKey: string, idx: number, subKey: string, val: unknown) {
    const list = Array.isArray(values[fieldKey]) ? [...(values[fieldKey] as Record<string, unknown>[])] : [];
    list[idx] = { ...list[idx], [subKey]: val };
    values[fieldKey] = list;
  }

  function isFieldVisible(field: SettingsFieldSchema): boolean {
    const cond = field.visibleWhen;
    if (!cond || !cond.key) return true;
    return values[cond.key] === cond.equals;
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    for (const f of schema) {
      if (!isFieldVisible(f)) continue;
      if (f.type === 'secret') {
        const hasExisting = Boolean(secretsSet[f.key]) && !clearedSecrets[f.key];
        const hasNew = Boolean(secretDrafts[f.key]);
        if (f.required && !hasExisting && !hasNew) {
          nextErrors[f.key] = `${f.label} is required.`;
        }
        continue;
      }

      const v = values[f.key];
      const str = v === null || v === undefined ? '' : String(v).trim();

      if (f.required) {
        if (f.type === 'group') {
          if (!Array.isArray(v) || v.length === 0) nextErrors[f.key] = `Add at least one ${f.label}.`;
        } else if (f.type !== 'toggle' && str === '') {
          nextErrors[f.key] = `${f.label} is required.`;
        }
      }

      if (f.type === 'number' && str !== '') {
        const num = Number(v);
        if (Number.isNaN(num)) nextErrors[f.key] = 'Must be a number.';
        else if (f.min != null && num < f.min) nextErrors[f.key] = `Minimum is ${f.min}.`;
        else if (f.max != null && num > f.max) nextErrors[f.key] = `Maximum is ${f.max}.`;
      }

      if (f.pattern && str !== '') {
        try {
          if (!new RegExp(f.pattern).test(str)) {
            nextErrors[f.key] = `Invalid format for ${f.label}.`;
          }
        } catch {
          // ignore invalid regex in schema
        }
      }
    }
    errors = nextErrors;
    return Object.keys(nextErrors).length === 0;
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!validate()) return;

    const cleanValues = structuredClone($state.snapshot(values)) as Record<string, unknown>;
    const secretUpdates: Record<string, string | null> = {};

    for (const f of schema) {
      if (f.type !== 'secret') continue;
      if (clearedSecrets[f.key]) {
        secretUpdates[f.key] = null;
      } else if (secretDrafts[f.key]) {
        secretUpdates[f.key] = secretDrafts[f.key];
      }
    }

    onSubmit(cleanValues, secretUpdates);
  }
</script>

<form class="schema-form" onsubmit={handleSubmit}>
  {#each schema as field (field.key)}
    {#if isFieldVisible(field)}
    <div class="field">
      <div class="field-head">
        <label for={`sf-${field.key}`}>
          <strong>{field.label}</strong>
          {#if field.required}<span class="req">*</span>{/if}
        </label>
        {#if field.type === 'secret'}
          <span class="secret-badge" class:is-set={Boolean(secretsSet[field.key]) && !clearedSecrets[field.key]}>
            {Boolean(secretsSet[field.key]) && !clearedSecrets[field.key] ? 'Set' : 'Not set'}
          </span>
        {/if}
      </div>

      {#if field.helpText || field.helpLinkUrl}
        <div class="help muted">
          {#if field.helpText}{field.helpText}{/if}
          {#if field.helpLinkUrl}
            {#if field.helpText}{' '}{/if}
            <a class="help-link" href={field.helpLinkUrl} target="_blank" rel="noopener noreferrer">
              {field.helpLinkLabel || 'Help'} ↗
            </a>
          {/if}
        </div>
      {/if}

      {#if field.type === 'text' || field.type === 'url' || field.type === 'duration'}
        <input
          id={`sf-${field.key}`}
          type={field.type === 'url' ? 'url' : 'text'}
          placeholder={field.type === 'duration' ? 'e.g. 15m, 2h, 5s' : ''}
          bind:value={values[field.key]}
        />
      {:else if field.type === 'multiline'}
        <textarea id={`sf-${field.key}`} rows="3" bind:value={values[field.key]}></textarea>
      {:else if field.type === 'number'}
        <input
          id={`sf-${field.key}`}
          type="number"
          step="any"
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          bind:value={values[field.key]}
        />
      {:else if field.type === 'toggle'}
        <label class="toggle-row">
          <input id={`sf-${field.key}`} type="checkbox" bind:checked={values[field.key] as boolean} />
          <span>Enabled</span>
        </label>
      {:else if field.type === 'colour'}
        <input id={`sf-${field.key}`} type="color" bind:value={values[field.key]} />
      {:else if field.type === 'select'}
        {@const opts = field.dynamicOptionsEndpoint ? (dynamicOptions[field.key] ?? []) : (field.options ?? [])}
        <select id={`sf-${field.key}`} bind:value={values[field.key]}>
          <option value="">-- Choose --</option>
          {#each opts as opt (opt.value)}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      {:else if field.type === 'icon'}
        <IconPicker
          value={String(values[field.key] ?? '')}
          onSelect={(refId) => (values[field.key] = refId)}
        />
      {:else if field.type === 'secret'}
        <div class="secret-row">
          <input
            id={`sf-${field.key}`}
            type="password"
            placeholder={secretsSet[field.key] ? 'Enter new value to replace' : 'Enter secret value'}
            bind:value={secretDrafts[field.key]}
            oninput={() => (clearedSecrets[field.key] = false)}
          />
          {#if secretsSet[field.key] && !clearedSecrets[field.key]}
            <button type="button" class="danger" onclick={() => { clearedSecrets[field.key] = true; secretDrafts[field.key] = ''; }}>
              Clear
            </button>
          {/if}
        </div>
      {:else if field.type === 'group'}
        {@const rows = Array.isArray(values[field.key]) ? (values[field.key] as Record<string, unknown>[]) : []}
        <div class="group-list">
          {#each rows as row, rIdx}
            <div class="group-row">
              <div class="group-fields">
                {#each field.fields ?? [] as sub (sub.key)}
                  <label class="sub-field">
                    <span>{sub.label}</span>
                    {#if sub.type === 'toggle'}
                      <input
                        type="checkbox"
                        checked={Boolean(row[sub.key])}
                        onchange={(e) => updateGroupCell(field.key, rIdx, sub.key, (e.currentTarget as HTMLInputElement).checked)}
                      />
                    {:else if sub.type === 'colour'}
                      <input
                        type="color"
                        value={String(row[sub.key] ?? '#2563eb')}
                        oninput={(e) => updateGroupCell(field.key, rIdx, sub.key, (e.currentTarget as HTMLInputElement).value)}
                      />
                    {:else if sub.type === 'select'}
                      <select
                        value={String(row[sub.key] ?? '')}
                        onchange={(e) => updateGroupCell(field.key, rIdx, sub.key, (e.currentTarget as HTMLSelectElement).value)}
                      >
                        {#each sub.options ?? [] as opt}
                          <option value={opt.value}>{opt.label}</option>
                        {/each}
                      </select>
                    {:else}
                      <input
                        type={sub.type === 'number' ? 'number' : 'text'}
                        value={String(row[sub.key] ?? '')}
                        oninput={(e) => updateGroupCell(field.key, rIdx, sub.key, (e.currentTarget as HTMLInputElement).value)}
                      />
                    {/if}
                  </label>
                {/each}
              </div>
              <button type="button" class="icon-btn danger" aria-label="Remove row" onclick={() => removeGroupRow(field.key, rIdx)}>
                <Icon name="delete" size={18} />
              </button>
            </div>
          {/each}
          <button type="button" onclick={() => addGroupRow(field)}>
            <Icon name="plus" size={18} /> Add {field.label}
          </button>
        </div>
      {/if}

      {#if errors[field.key]}
        <div class="error-text">{errors[field.key]}</div>
      {/if}
    </div>
    {/if}
  {/each}

  <div class="form-actions">
    {#if onCancel}
      <button type="button" onclick={onCancel} disabled={saving}>Cancel</button>
    {/if}
    <button type="submit" class="primary" disabled={saving}>
      {saving ? 'Saving...' : submitLabel}
    </button>
  </div>
</form>

<style>
  .schema-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.9rem;
  }
  .req {
    color: var(--tw-state-critical);
    margin-left: 2px;
  }
  .help {
    font-size: 0.8rem;
  }
  .help-link {
    color: var(--tw-accent);
    text-decoration: none;
    font-weight: 500;
    white-space: nowrap;
  }
  .help-link:hover {
    text-decoration: underline;
  }
  .toggle-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
  }
  .secret-badge {
    font-size: 0.74rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--tw-border);
    color: var(--tw-text-muted);
  }
  .secret-badge.is-set {
    background: var(--tw-state-normal);
    color: #ffffff;
  }
  .secret-row {
    display: flex;
    gap: 8px;
  }
  .secret-row input {
    flex: 1;
  }
  .icon-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .icon-opt {
    min-width: 38px;
    min-height: 38px;
    padding: 0;
    background: var(--tw-surface-elevated);
  }
  .icon-opt.selected {
    background: var(--tw-accent);
    color: var(--tw-accent-contrast);
    border-color: transparent;
  }
  .group-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .group-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px;
    border-radius: 10px;
    background: var(--tw-surface-elevated);
    border: 1px solid var(--tw-border);
  }
  .group-fields {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 8px;
  }
  .sub-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.8rem;
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 6px;
  }
</style>
