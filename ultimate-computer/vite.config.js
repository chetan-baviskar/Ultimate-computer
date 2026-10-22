import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // Proxy /api/* to the local Express API server during development
    // so the browser never needs to know the API's address (and CORS stays clean).
    // Start it separately with: npm run server
    //
    // IMPORTANT: the API runs on :5001 (not the Express default :5000) because
    // another project on this machine (Renuka Auto Parts) already serves :5000.
    // On Windows two Node servers CAN bind the same port (SO_REUSEADDR), so a
    // collision does not crash either app — the proxy just silently sends every
    // /api request to the WRONG backend, whose 401/500 responses made the
    // frontend report "Login service is temporarily unavailable". Keep the
    // target here and PORT in server/.env in sync.
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true
      }
    }
  }
})
