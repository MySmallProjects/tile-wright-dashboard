import { mount } from 'svelte';
import './styles/tokens.css';
import './styles/app.css';
import { registerClockTile } from './lib/tiles/tw-clock-tile';
import { registerNoteTile } from './lib/tiles/tw-note-tile';
import App from './App.svelte';

registerClockTile();
registerNoteTile();

const target = document.getElementById('app');
if (!target) {
  throw new Error('Root #app element not found.');
}

mount(App, { target });
