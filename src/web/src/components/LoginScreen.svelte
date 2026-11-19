<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '../lib/api';
  import type { PublicUser } from '../types';
  import Icon from './Icon.svelte';

  let { onLoggedIn }: { onLoggedIn: (user: PublicUser) => void } = $props();

  let users = $state<PublicUser[]>([]);
  let loading = $state(true);
  let selectedUser = $state<PublicUser | null>(null);
  let password = $state('');
  let submitting = $state(false);
  let error = $state('');

  onMount(async () => {
    try {
      users = await api.getLoginUsers();
    } catch {
      error = 'Could not load user list.';
    } finally {
      loading = false;
    }
  });

  async function pickUser(user: PublicUser) {
    error = '';
    if (user.hasPassword) {
      selectedUser = user;
      password = '';
      return;
    }

    submitting = true;
    try {
      const logged = await api.login(user.id, null);
      onLoggedIn(logged);
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Login failed.';
    } finally {
      submitting = false;
    }
  }

  async function submitPassword(e: SubmitEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    error = '';
    submitting = true;
    try {
      const logged = await api.login(selectedUser.id, password);
      onLoggedIn(logged);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        error = 'Too many failed attempts. Please wait a few minutes.';
      } else if (err instanceof ApiError && err.status === 401) {
        error = 'Incorrect password.';
      } else {
        error = err instanceof ApiError ? err.message : 'Login failed.';
      }
    } finally {
      submitting = false;
    }
  }
</script>

<div class="center-screen">
  <div class="card login-card">
    <div class="header">
      <Icon name="view-dashboard" size={30} />
      <div>
        <h1>Tilewright</h1>
        <p class="muted">Choose a profile to sign in</p>
      </div>
    </div>

    {#if loading}
      <p class="muted">Loading users...</p>
    {:else if selectedUser}
      <form class="pw-form" onsubmit={submitPassword}>
        <div class="selected-banner">
          <Icon name={selectedUser.role === 'admin' ? 'shield-account' : 'account'} size={22} />
          <strong>{selectedUser.displayName}</strong>
        </div>

        <label class="field">
          <span>Password</span>
          <input type="password" bind:value={password} placeholder="Enter password" required />
        </label>

        {#if error}
          <div class="error-text">{error}</div>
        {/if}

        <div class="actions">
          <button type="button" onclick={() => { selectedUser = null; error = ''; }}>Back</button>
          <button type="submit" class="primary" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </form>
    {:else}
      <div class="user-grid">
        {#each users as user (user.id)}
          <button
            type="button"
            class="user-tile"
            disabled={submitting}
            onclick={() => pickUser(user)}
          >
            <Icon name={user.role === 'admin' ? 'shield-account' : 'account'} size={28} />
            <span class="name">{user.displayName}</span>
            <span class="meta muted">
              {#if user.hasPassword}
                <Icon name="lock" size={14} /> Password
              {:else}
                Tap to enter
              {/if}
            </span>
          </button>
        {/each}
      </div>

      {#if error}
        <div class="error-text">{error}</div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .center-screen {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .login-card {
    width: 100%;
    max-width: 520px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header h1 {
    margin: 0;
    font-size: 1.4rem;
  }
  .header p {
    margin: 2px 0 0;
    font-size: 0.9rem;
  }
  .user-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
    gap: 12px;
  }
  .user-tile {
    flex-direction: column;
    padding: 18px 12px;
    min-height: 112px;
    gap: 6px;
    background: var(--tw-surface-elevated);
  }
  .user-tile .name {
    font-weight: 600;
    font-size: 1rem;
  }
  .user-tile .meta {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.78rem;
  }
  .pw-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .selected-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--tw-surface-elevated);
    border: 1px solid var(--tw-border);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.9rem;
    font-weight: 500;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
