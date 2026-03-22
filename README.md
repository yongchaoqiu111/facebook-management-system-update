# Facebook管理系统 - 登录功能更新包

## 更新内容

本次更新主要改进了登录功能，实现了以下三个功能：

1. **登录**：打开Facebook/TikTok登录页面，用户手动输入账号密码
2. **保存Cookie**：保存当前浏览器的登录状态到Cookie文件
3. **携带Cookie登录**：使用保存的Cookie自动登录，无需重新输入账号密码

## 文件说明

本次更新包含以下文件：

- `public/login.html` - 登录页面，已删除账号密码输入框，添加了三个功能按钮
- `skills/login/login-skill.ts` - 登录技能核心逻辑，实现了三个功能
- `server.js` - 添加了CORS配置，确保前端可以正常调用后端API

## 安装说明

1. **停止服务器**（如果正在运行）：
   - 打开运行服务器的命令行窗口
   - 按 `Ctrl + C` 停止服务器

2. **复制文件**：
   - 将更新包中的文件复制到对应目录中
   - `public/login.html` → `项目根目录/public/login.html`
   - `skills/login/login-skill.ts` → `项目根目录/skills/login/login-skill.ts`
   - `server.js` → `项目根目录/server.js`

3. **重启服务器**：
   - 在项目根目录执行：
   ```bash
   node server.js
   ```
   - 服务器将在 http://localhost:3000 启动

## 使用说明

1. 打开登录页面：http://localhost:3000/login.html
2. 选择平台（Facebook或TikTok）
3. 点击"登录"按钮打开登录页面，手动输入账号密码
4. 登录成功后，点击"保存Cookie"按钮保存登录状态
5. 下次可以直接点击"携带Cookie登录"按钮，无需重新输入账号密码

## 注意事项

- Cookie保存路径：`D:\weibo\cookie`
- 如果server.js文件已有其他修改，请只替换CORS相关代码（第18-29行）
- 更新后请重启服务器使修改生效
