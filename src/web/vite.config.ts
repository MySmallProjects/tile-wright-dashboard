import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'node:fs';
import path from 'node:path';

function readTilewrightVersion() {
  const srcDir = path.resolve(__dirname, '..');
  const propsPath = path.join(srcDir, 'version.props');
  const buildPath = path.join(srcDir, 'build-number.txt');

  let major = '0';
  let minor = '1';
  let patch = '0';
  let buildNumber = '0';

  if (fs.existsSync(propsPath)) {
    const xml = fs.readFileSync(propsPath, 'utf8');
    major = xml.match(/<Major>\s*(\d+)\s*<\/Major>/)?.[1] ?? major;
    minor = xml.match(/<Minor>\s*(\d+)\s*<\/Minor>/)?.[1] ?? minor;
    patch = xml.match(/<Patch>\s*(\d+)\s*<\/Patch>/)?.[1] ?? patch;
  }

  if (fs.existsSync(buildPath)) {
    const raw = fs.readFileSync(buildPath, 'utf8').trim();
    if (/^\d+$/.test(raw)) {
      buildNumber = raw;
    }
  }

  return {
    version: `${major}.${minor}.${patch}+${buildNumber}`,
    buildNumber: Number(buildNumber)
  };
}

const stamped = readTilewrightVersion();

export default defineConfig({
  plugins: [svelte()],
  define: {
    __APP_VERSION__: JSON.stringify(stamped.version),
    __APP_BUILD_NUMBER__: JSON.stringify(stamped.buildNumber)
  },
  build: {
    outDir: path.resolve(__dirname, '../Tilewright.Server/wwwroot'),
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5050',
      '/hubs': {
        target: 'http://localhost:5050',
        ws: true
      }
    }
  }
});
