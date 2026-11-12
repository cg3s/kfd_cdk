# CODETRADER 静态兑换页

使用卡付达文档 §4「公开兑换接口（做法 A / B）」实现的纯静态兑换页。浏览器直接请求公开 API，不需要 Node.js 服务、`.env` 或商户 API 密钥。

## aaPanel 静态部署

1. 在 aaPanel 添加网站 `kfd.codetrader.xyz`，配置 DNS 解析并启用 HTTPS。
2. 将以下三个文件上传到该网站根目录（例如 `/www/wwwroot/kfd.codetrader.xyz`）：
   - `index.html`
   - `app.js`
   - `styles.css`
3. 确认网站运行目录指向该目录，然后访问 `https://kfd.codetrader.xyz`。
4. 在卡付达「我的 CDK → 品牌与兑换页 → 自建兑换页地址」登记来源 `https://kfd.codetrader.xyz`。本地开发时则登记实际使用的本地来源，例如 `http://localhost:5173`。

不要将项目中的 `.env` 上传到网站目录；静态页面不读取该文件。如果它保存过 API 密钥，请将其保存在网站根目录之外。

请用 HTTP 静态服务器预览，不要通过 `file://` 打开 HTML。项目根目录运行：

```powershell
py -m http.server 5173
```

然后访问 `http://localhost:5173`。本地来源也必须先登记才能跨域请求公开 API。

## 公开 API 流程

网页按文档 §4 调用 `https://kafuda.com/api/public/cdk`：

1. `POST /preview`，只验证卡密。
2. 卡密可用后，用户填写 Session；`POST /check` 验证账号并取得一次性兑换令牌。
3. 用户确认账号后，`POST /redeem` 开始兑换。
4. `GET /status?token=...` 每 3 秒查询进度。

公开接口按用户 IP 限流，且仅允许已登记的来源跨域访问。**不要把商户 API 密钥放进前端或静态文件**；本静态版本不读取 `.env`。Session 不写入本地存储，账号检查请求完成后会清空表单。
