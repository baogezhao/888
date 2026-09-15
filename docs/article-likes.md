# 开通文章点赞

页面已支持免登录点赞、取消点赞和共享总数。上线前需要在现有 Firebase 项目 `baogecaiba` 中完成以下配置。未填写 API key 时，文章底部显示禁用的“点赞暂未开放”，不显示虚假数量。

## 一次性配置

1. 打开 [Firebase 控制台](https://console.firebase.google.com/project/baogecaiba/overview)，在项目设置中添加一个 **Web 应用**（无需启用 Hosting）。复制 Web 配置里的 `apiKey`、`projectId` 和 `appId`，填入 `site-config.json` 的 `likes.firebase`。这里使用公开的 Web 应用配置，不使用服务账号私钥，也不直接沿用安卓应用限制的 API key。
2. 在 **Authentication → Sign-in method** 中启用 **Anonymous（匿名）**。在 Authentication 设置的授权域中添加 `baogezhao.github.io`；本地测试可添加 `localhost`、`127.0.0.1`。
3. 在 **Firestore Database** 中创建默认数据库（Standard / Native 模式，生产模式）。如果已经存在则使用现有数据库。
4. 在 Firestore 的 **Rules（规则）** 页面发布仓库里的 `firestore.likes.rules`。如果已有其他业务规则，只把文件中的 `match /articleLikes/...` 块合并到原有 `match /databases/{database}/documents` 内，保留原规则；同时确认没有覆盖该路径的宽泛写入许可。
5. 执行 `npm.cmd run build`。将源代码及 `site-config.json` 正常提交、推送后，由现有 GitHub Actions 发布网站。仅点击本地文章管理后台的“发布”不会自动暂存本次新增脚本。

配置结构：

```json
"likes": {
  "enabled": true,
  "firebase": {
    "projectId": "baogecaiba",
    "apiKey": "从 Web 应用配置复制",
    "appId": "从 Web 应用配置复制"
  }
}
```

## 验收

- 打开文章，应显示服务端总数；点赞后增加 1，再点取消后减少 1。
- 刷新同一浏览器，应恢复“已点赞”；另一个浏览器刷新后应看到同一总数。
- 快速重复点击只发送一次操作。网络故障时不虚增数字，点击“重试”重复提交原操作。
- 安卓 App 使用同一网页，已开启 JavaScript 和本地存储；仍需在真机验证 Firebase 网络连通性。
- 当前环境自动检查：`node --test scripts/article-likes.test.js`。这些交互测试模拟数据服务，不能代替真实 Firebase 和安全规则验收。
- 在 Firebase 规则模拟器中确认：匿名身份只能创建/删除以自身 UID 命名的票；不能写入他人 UID，不能增加额外字段，未登录不能写入。

## 数据与边界

每篇文章以文件名（去除 `.md`）的 SHA-256 为标识，路径为 `articleLikes/{文章标识}/votes/{匿名 UID}`，每条票仅保存 `{ "liked": true }`。重复点赞覆盖同一文档，取消点赞删除该文档；总数通过服务端聚合查询获取，不下载完整票列表。修改正文、重新构建不会清空点赞；重命名文章文件会成为新文章。

总数在打开页面和操作后更新，其他读者的新点赞通过刷新页面查看。浏览器与 App 的匿名身份彼此独立；清除站点数据、隐私模式或换设备可能生成新身份，因此属于浏览器级去重，不能阻止恶意创建大量匿名身份。不要启用匿名账号自动清理，否则旧票可能失去可取消它的身份。

聚合查询需要读取权限，所以规则允许公开读取该文章的票（随机匿名 UID 和布尔值）；不要向票里加入姓名、邮箱等个人数据。Firestore 与 Authentication 受项目配额限制。Firebase 服务连接失败时显示错误并允许重试，正文仍可正常阅读。设置 `likes.enabled` 为 `false` 可以隐藏入口。

实现依据：[匿名登录](https://firebase.google.com/docs/auth/web/anonymous-auth)、[服务端聚合计数](https://firebase.google.com/docs/firestore/query-data/aggregation-queries)、[查询与安全规则](https://firebase.google.com/docs/firestore/security/rules-query)。
