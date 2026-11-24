import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Makes the app open without a network: a service worker keeps the built app
    // (scripts, styles, fonts, icons, index.html) on the phone. Supabase API calls
    // are other-origin requests and are never cached here.
    VitePWA({
      // A new version waits until the user taps "Last på nytt" (see UpdatePrompt),
      // instead of swapping silently in the middle of a shopping trip.
      registerType: 'prompt',
      injectRegister: false, // registered by src/components/UpdatePrompt.tsx
      manifest: false, // public/manifest.webmanifest is the source of truth
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff,woff2}'],
        navigateFallback: '/index.html', // any route opens the app shell offline
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
