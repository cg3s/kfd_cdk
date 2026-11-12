# 静态兑换页

使用卡付达文档 §4「公开兑换接口（做法 A / B）」实现的纯静态兑换页。浏览器直接请求公开 API，不需要 Node.js 服务、`.env` 或商户 API 密钥。


## 网站名称配置

在 `config.js` 中设置浏览器标签页标题和页脚品牌名。默认都为“AI代充”：

```js
window.REDEMPTION_CONFIG = {
  siteTitle: "AI代充",
  footerBrandName: "AI代充",
};
```

修改其中的值后，将更新后的 `config.js` 上传到网站根目录即可。

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
