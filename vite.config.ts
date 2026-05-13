import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed to GitHub Pages at https://dangervalentine.github.io/react-connect4/,
// so all built assets need to resolve under the repo-name subpath. Vite's dev
// server also serves under this base — the dev URL is /react-connect4/.
//
// If you fork or rename the repo, update this string accordingly.
// https://vitejs.dev/config/
export default defineConfig({
  base: '/react-connect4/',
  plugins: [react()],
  server: {
    port: 3000,
  },
});
