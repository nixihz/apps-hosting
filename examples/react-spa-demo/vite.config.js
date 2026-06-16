import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 关键点：base 必须和 apps.yaml 的 route 保持一致。
export default defineConfig({
  base: '/x/react-spa-demo/',
  plugins: [react()]
});
