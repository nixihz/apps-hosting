# apps SDK

当前提供最小 Node SDK：`sdk/node/client.js`。

## 用法

```js
import { AppsClient } from '../sdk/node/client.js';

const client = new AppsClient({
  baseUrl: 'http://127.0.0.1:4173',
  headers: { authorization: 'Bearer <token>' }
});

const platform = await client.platform();
const apps = await client.apps();
const events = await client.events({ limit: 20 });
```

## 能力

- `platform()`
- `apps()`
- `events()`
- `deployments(name)`
- `metrics(name)`
- `deploy(name, sourcePath)`
- `rollback(name, releaseId)`

## 类型定义

- `sdk/types.d.ts`
