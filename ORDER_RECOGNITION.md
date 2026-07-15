# 订单截图识别：GitHub Pages + Vercel

GitHub Pages 只能托管静态前端，不能安全保存 `OPENAI_API_KEY`。本项目因此把识别放在独立的 Vercel Function：浏览器把截图发送到 Vercel，Vercel 再用仅存在于服务器环境变量中的密钥调用 OpenAI Vision。

```
GitHub Pages 前端 → Vercel /api/recognize-order → OpenAI Responses API
       公开端点                    OPENAI_API_KEY（仅服务器）
```

## 已实现的接口

- Function 文件：`vercel-api/api/recognize-order.ts`
- 请求：`POST /api/recognize-order`
- 请求体：一张 JSON/base64 图片；多图导入会逐张发送，避免触发 Vercel 4.5MB 单请求限制。
- 支持：JPG、PNG、WEBP，单张最多 3MB。
- 成功响应：

```json
{
  "foodName": "番茄牛腩饭",
  "category": "米饭",
  "confidence": 0.93
}
```

`confidence` 是 0–1 的数值。识别不到菜品时接口返回 HTTP 422；前端不会生成任何示例数据，也不会修改默认池。

## 部署到 Vercel

1. 登录 [Vercel](https://vercel.com/new)，选择 GitHub 仓库 `4422tt/default-life`。
2. 在 **Root Directory** 选择 `vercel-api`；Framework Preset 选 **Other**。
3. 在 **Settings → Environment Variables** 新增 `OPENAI_API_KEY`，勾选 Production（也建议勾选 Preview）。不要使用 `NEXT_PUBLIC_` 前缀。
4. 可选新增：
   - `OPENAI_VISION_MODEL=gpt-4o-mini`
   - `ALLOWED_ORIGINS=https://4422tt.github.io`
5. 点击 Deploy。部署完成后复制形如 `https://your-project.vercel.app` 的地址。
6. 在本项目根目录新建 `.env.local`，写入：

   ```bash
   NEXT_PUBLIC_ORDER_RECOGNITION_ENDPOINT=https://your-project.vercel.app/api/recognize-order
   ```

7. 重新构建并发布 GitHub Pages。静态页面需要在构建时读到这个公开的接口 URL：

   ```powershell
   $env:NEXT_PUBLIC_BASE_PATH='/default-life'
   $env:NEXT_PUBLIC_ORDER_RECOGNITION_ENDPOINT='https://your-project.vercel.app/api/recognize-order'
   .\node_modules\.bin\next.CMD build
   ```

   然后把 `out` 同步到 `docs`，提交并推送即可。`OPENAI_API_KEY` 不参与这一步，也绝不会出现在 GitHub Pages 的构建产物中。

## 本地验证

在 `vercel-api` 目录执行 `vercel dev`，并在本项目根目录设置：

```bash
NEXT_PUBLIC_ORDER_RECOGNITION_ENDPOINT=http://localhost:3000/api/recognize-order
```

Vercel 会在本地读取 `vercel-api/.env.local` 中的 `OPENAI_API_KEY`。该文件已被 `.gitignore` 忽略，不能提交。

## 上线注意

这个版本通过来源白名单限制浏览器调用，适合黑客松演示。公开接口仍可能被非浏览器客户端滥用；正式公开产品应再增加登录、服务端限流或 Vercel WAF，避免 OpenAI 额度被刷。
