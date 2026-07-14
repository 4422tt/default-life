# 订单截图识别接口

Default Life 的 GitHub Pages 版本是纯静态站点，不能安全保存模型 API Key，也不能直接运行 Next.js API Route。因此前端只连接你控制的服务端识别接口，不会把密钥发送到浏览器。

## 前端配置

构建前设置：

```bash
NEXT_PUBLIC_ORDER_RECOGNITION_ENDPOINT=https://your-backend.example.com/api/import-orders
```

未设置时，上传流程会明确显示“当前未配置图片识别服务”，不会返回演示菜品。

## 接口约定

- Method: `POST`
- Content-Type: `multipart/form-data`
- 字段：一个或多个 `images`
- 成功响应：HTTP 200
- 没有识别到订单：HTTP 422

成功响应只需要返回真实识别项目：

```json
{
  "items": [
    {
      "id": "provider-item-id",
      "merchantName": "识别到的商家名称或 null",
      "dishName": "识别到的完整菜品名称",
      "quantity": 1,
      "unitPrice": 24,
      "paidAmount": 26,
      "category": "粉面",
      "confidence": 0.96,
      "sourceImageId": "image-1",
      "sourceFileName": "order.png"
    }
  ]
}
```

服务端可以使用支持图片输入的多模态模型或 OCR。模型密钥必须配置在服务端环境变量，例如 `OPENAI_API_KEY`，不能使用 `NEXT_PUBLIC_` 前缀。

## 识别规则

- 只提取已完成订单。
- 一张图片包含多笔订单时全部提取。
- 看不清的字段返回 `null`，不要猜测。
- 不要返回示例菜品或随机菜名。
- 输出必须是合法 JSON。
