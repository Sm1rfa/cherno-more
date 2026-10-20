import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // injectManifest (not the default generateSW) because push/
      // notificationclick handlers require a hand-written service worker —
      // see src/sw.ts, which reproduces the old generateSW runtime-caching
      // behavior manually plus adds those handlers.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg}'],
      },
      manifest: {
        name: 'ПФК Черно Море Варна',
        short_name: 'Черно Море',
        description: 'Неофициално фен приложение за ПФК Черно Море Варна - мачове, класиране, отбор, история и новини.',
        lang: 'bg',
        theme_color: '#1a5c1a',
        background_color: '#0f2e0f',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/emblema-1.jpg', sizes: '192x192', type: 'image/jpeg' },
          { src: '/emblema-1.jpg', sizes: '512x512', type: 'image/jpeg' },
        ],
      },
    }),
  ],
})
