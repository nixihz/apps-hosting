# React SPA Demo 安装样例

示例目录：`examples/react-spa-demo`。

这个 Demo 展示 React/Vite SPA 如何部署到 Keli Apps（兼容 apps runtime）的子路径：

```text
/x/react-spa-demo
/x/react-spa-demo/metrics
/x/react-spa-demo/settings/profile
```

## 关键配置

`apps.yaml`：

```yaml
name: react-spa-demo
title: React SPA 示例
type: frontend
version: 1.0.0
route: /x/react-spa-demo
entry: dist
```

`vite.config.js`：

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/x/react-spa-demo/',
  plugins: [react()]
});
```

如果使用 React Router，建议：

```jsx
<BrowserRouter basename="/x/react-spa-demo">
  <App />
</BrowserRouter>
```

## 构建

真实项目中先构建：

```bash
cd examples/react-spa-demo
npm install
npm run build
```

本仓库示例已经内置了一个可直接安装的 `dist/index.html`，所以不构建也能验证。

## 安装到 Keli Apps

回到项目根目录：

```bash
APPS_DATA_DIR=.apps-data node ./bin/apps.js install ./examples/react-spa-demo
```

查看应用：

```bash
APPS_DATA_DIR=.apps-data node ./bin/apps.js list
```

启动平台：

```bash
APPS_DATA_DIR=.apps-data APPS_PORT=4199 node ./src/server.js
```

访问：

```text
http://127.0.0.1:4199/x/react-spa-demo
http://127.0.0.1:4199/x/react-spa-demo/metrics
http://127.0.0.1:4199/x/react-spa-demo/settings/profile
```

后两个地址用于验证 SPA fallback：即使直接刷新深层路由，也应该返回 React 应用。

## Vue 对应配置

Vue/Vite 项目同理：

```js
// vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: '/x/my-vue-app/',
  plugins: [vue()]
});
```

Vue Router：

```js
createRouter({
  history: createWebHistory('/x/my-vue-app/'),
  routes
});
```
