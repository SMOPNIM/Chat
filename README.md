# Chat

一个基于 WebSocket 的实时聊天软件，支持好友系统、群聊、富文本消息。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js + Express + WebSocket (`ws`) |
| 数据库 | SQLite (`sql.js`) |
| 前端 | 原生 HTML/CSS/JS |
| 富文本 | Marked (Markdown) + KaTeX (LaTeX) + DOMPurify |

## 功能

- **用户系统** — 注册/登录，bcrypt 密码加密，session cookie
- **好友系统** — 搜索用户、发送好友请求、接受/拒绝
- **私聊** — 仅限好友之间私聊，实时消息推送
- **群聊** — 创建群组、邀请好友、退出群组、成员计数
- **公共聊天室** — 所有在线用户实时交流
- **@提及** — 输入 `@` 自动补全在线用户，消息中高亮
- **Markdown** — 支持粗体、代码、链接、列表等
- **LaTeX 公式** — `$...$` 行内公式，`$$...$$` 行间公式
- **图片发送** — 按钮上传、Ctrl+V 粘贴、拖拽，Base64 嵌入
- **GIF 动图** — GIF 搜索面板（GIPHY API）、上传限制 20MB、GIF 徽标、悬停播放/暂停
- **输入预览** — 输入区右侧实时预览 Markdown/LaTeX/@提及 渲染效果
- **在线状态** — 实时显示在线用户，好友在线状态标识

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务
npm start
```

访问 **http://localhost:3000**

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `GIPHY_API_KEY` | — | GIPHY API 密钥，用于 GIF 搜索面板，[免费申请](https://developers.giphy.com) |

## 项目结构

```
├── server.js         # HTTP + WebSocket 服务
├── db.js             # SQLite 数据库操作
├── auth.js           # 认证与 REST API
├── public/
│   ├── index.html    # 登录/注册页
│   ├── chat.html     # 聊天主页面
│   ├── css/style.css # 样式
│   └── js/
│       ├── auth.js   # 登录注册逻辑
│       └── chat.js   # 聊天客户端逻辑
└── package.json
```
