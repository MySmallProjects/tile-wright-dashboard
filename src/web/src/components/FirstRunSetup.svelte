<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import type { PublicUser } from '../types';
  import Icon from './Icon.svelte';

  let { onCreated }: { onCreated: (user: PublicUser) => void } = $props();

  let displayName = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let submitting = $state(false);
  let error = $state('');

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    const trimmed = displayName.trim();
    if (!trimmed) {
      error = 'Please enter a display name.';
      return;
    }
    if (password && password !== confirmPassword) {
      error = 'Passwords do not match.';
      return;
    }

    submitting = true;
    try {
      const user = await api.setupAdmin(trimmed, password || null);
      onCreated(user);
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Failed to create admin user.';
    } finally {
      submitting = false;
    }
  }
</script>

<div class="center-screen">
  <form class="card setup-card" onsubmit={handleSubmit}>
    <div class="header">
      <Icon name="shield-account" size={32} />
      <div>
        <h1>Welcome to Tilewright</h1>
        <p class="muted">Create the first administrator account to get started.</p>
      </div>
    </div>

    <label class="field">
      <span>Display name</span>
      <input type="text" bind:value={displayName} placeholder="e.g. Alex" required />
    </label>

    <label class="field">
      <span>Password <span class="muted">(optional)</span></span>
      <input type="password" bind:value={password} placeholder="Leave blank for passwordless login" />
    </label>

    {#if password}
      <label class="field">
        <span>Confirm password</span>
        <input type="password" bind:value={confirmPassword} placeholder="Re-enter password" />
      </label>
    {/if}

    {#if error}
      <div class="error-text">{error}</div>
    {/if}

    <button type="submit" class="primary" disabled={submitting}>
      {submitting ? 'Creating admin...' : 'Create Admin & Continue'}
    </button>
  </form>
</div>

<style>
  .center-screen {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .setup-card {
    width: 100%;
    max-width: 440px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header h1 {
    margin: 0;
    font-size: 1.35rem;
  }
  .header p {
    margin: 4px 0 0;
    font-size: 0.9rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.9rem;
    font-weight: 500;
  }
</style>
