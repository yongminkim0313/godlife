/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { precachePlugin } from './src/build/precache-plugin';

export default defineConfig({
  plugins: [vue(), precachePlugin()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
