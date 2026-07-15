# Default Life 导入服务：GitHub Pages + Vercel + DeepSeek

GitHub Pages 只托管静态前端，不能保存模型密钥。Default Life 将“生活规则分析”部署为独立 Vercel Function：浏览器只请求公开接口，Vercel 再使用仅存在于服务器环境变量中的 `DEEPSEEK_API_KEY` 调用 DeepSeek。

```text
GitHub Pages 前端 → Vercel /api/recognize-order → DeepSeek Chat Completions
       公开接口 URL                  DEEPSEEK_API_KEY（仅服务器端）
```

## 已实现的接口

Function 文件：`vercel-api/api/recognize-order.ts`

接口地址：`POST /api/recognize-order`

### 建立生活默认规则

请求：

```json
{
  "action": "life-rule",
  "userInput": "订单名称：麻辣烫；预算：30元；历史选择次数：6"
}
```

成功响应：

```json
{
  "result": "麻辣烫",
  "category": "晚餐",
  "confidence": 0.92,
  "defaultRule": "工作日晚餐优先选择30分钟内解决、偏辣、预算30元以内"
}
```

接口错误时会返回：

```json
{
  "error": "AI服务暂时不可用，请稍后重试"
}
```

### 外卖截图的降级流程

DeepSeek 的此服务仅用于文字理解，不会将图片直接发送给模型。截图仍可上传和预览；点击继续后，界面会打开“补充订单名称”，提示“请输入订单名称，我会帮你建立默认规则”。用户填写真实订单名称后，才会调用上面的 DeepSeek 文本接口。

这个流程不会生成演示菜品、不会伪造 OCR 结果，也不会在失败时修改默认池。未来接入 OCR 时，只需让 OCR 将图片转成文字，再把文字发往 `action: "life-rule"`。

## 部署到 Vercel

1. 打开 [Vercel](https://vercel.com/new)，导入 GitHub 仓库 `4422tt/default-life`。
2. 保持 **Root Directory** 为仓库根目录；当前项目会同时部署 Next.js 前端与根目录的 `/api/recognize-order` Function。无需单独切换 Root Directory。
3. 在 **Settings → Environment Variables** 添加：

   ```text
   DEEPSEEK_API_KEY=你的DeepSeek密钥
   ```

   勾选 **Production** 和 **Preview**。不要使用 `NEXT_PUBLIC_` 前缀。
4. 可选添加：

   ```text
   DEEPSEEK_MODEL=deepseek-chat
   ALLOWED_ORIGINS=https://4422tt.github.io
   ```

5. 点击 **Deploy**；若项目已经部署过，在修改环境变量后点击 **Redeploy**。
6. 复制 Vercel 域名，例如 `https://your-project.vercel.app`。
7. 在项目根目录新建未提交的 `.env.local`：

   ```bash
   NEXT_PUBLIC_ORDER_RECOGNITION_ENDPOINT=https://your-project.vercel.app/api/recognize-order
   ```

8. 重新构建并发布 GitHub Pages：

   ```powershell
   $env:NEXT_PUBLIC_BASE_PATH='/default-life'
   $env:NEXT_PUBLIC_ORDER_RECOGNITION_ENDPOINT='https://your-project.vercel.app/api/recognize-order'
   .\node_modules\.bin\next.CMD build
   ```

   然后将 `out` 同步至 `docs`、提交并推送。密钥不会参与 GitHub Pages 构建，也不会出现在前端产物中。

## 本地验证

在 `vercel-api` 目录运行 `vercel dev`，并在 `vercel-api/.env.local` 中保存（该文件不能提交）：

```bash
DEEPSEEK_API_KEY=你的DeepSeek密钥
DEEPSEEK_MODEL=deepseek-chat
```

在项目根目录设置：

```bash
NEXT_PUBLIC_ORDER_RECOGNITION_ENDPOINT=http://localhost:3000/api/recognize-order
```

## 上线注意

当前 CORS 白名单适合黑客松演示。公开产品应继续增加登录、服务端限流和 Vercel WAF，避免模型额度被滥用。
