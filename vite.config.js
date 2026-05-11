import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';

// Get Git info
const commitHash = execSync('git rev-parse --short HEAD').toString().trim();
const appVersion = execSync('git describe --tags --always').toString().trim();

export default defineConfig({
  define: {
    '__GIT_COMMIT__': JSON.stringify(commitHash),
    '__APP_VERSION__': JSON.stringify(appVersion),
  },
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        about: './about.html',
      },
    },
  },
  plugins: [
    {
      name: 'html-transform',
      transformIndexHtml(html) {
        return html
          .replace(/__APP_VERSION__/g, appVersion)
          .replace(/__GIT_COMMIT__/g, commitHash);
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.svg', 'fonts/**/*.ttf', 'data/*.fit'],
      manifest: {
        name: 'Swim Data Analyser',
        short_name: 'SwimAnaliser',
        description: 'Analyse and manage your swim data',
        theme_color: '#77529e',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ]
});
