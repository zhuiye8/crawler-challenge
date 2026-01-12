# 阿里云 Ubuntu 服务器部署指南

## 前置要求

- 阿里云 Ubuntu 服务器 (推荐 Ubuntu 20.04/22.04)
- 公网 IP 地址
- 开放端口 3000 (或配置 Nginx 反向代理使用 80 端口)

---

## 方式一：Docker 部署（推荐）

### 1. 连接服务器

```bash
ssh root@你的服务器IP
```

### 2. 安装 Docker

```bash
# 更新系统
apt update && apt upgrade -y

# 安装 Docker
curl -fsSL https://get.docker.com | sh

# 启动 Docker
systemctl start docker
systemctl enable docker

# 安装 Docker Compose
apt install docker-compose -y
```

### 3. 上传项目文件

**方式 A: 使用 scp 上传**

在本地电脑执行:
```bash
# Windows PowerShell
scp -r C:\work\test\crawler-challenge root@你的服务器IP:/root/
```

**方式 B: 使用 Git**

在服务器上:
```bash
# 如果你把代码推送到了 Git 仓库
git clone https://github.com/你的用户名/crawler-challenge.git
cd crawler-challenge
```

### 4. 启动服务

```bash
cd /root/crawler-challenge

# 构建并启动
docker-compose up -d --build

# 查看日志
docker-compose logs -f

# 查看状态
docker-compose ps
```

### 5. 配置防火墙（阿里云安全组）

登录阿里云控制台:
1. 进入 **云服务器 ECS** → **安全组**
2. 点击 **配置规则** → **添加安全组规则**
3. 添加规则:
   - 协议类型: TCP
   - 端口范围: 3000
   - 授权对象: 0.0.0.0/0
   - 描述: Crawler Challenge

### 6. 访问测试

```
http://你的公网IP:3000
```

---

## 方式二：直接部署（无 Docker）

### 1. 安装 Node.js

```bash
# 安装 NodeSource 仓库
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# 安装 Node.js
apt install -y nodejs

# 验证安装
node -v  # 应显示 v20.x.x
npm -v
```

### 2. 安装编译依赖（用于 better-sqlite3）

```bash
apt install -y python3 make g++
```

### 3. 上传并安装项目

```bash
# 上传项目（在本地执行）
scp -r C:\work\test\crawler-challenge root@你的服务器IP:/root/

# 在服务器上
cd /root/crawler-challenge

# 安装依赖
npm install

# 初始化数据库
npm run init-db
```

### 4. 使用 PM2 管理进程

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start src/app.js --name crawler-challenge

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status

# 查看日志
pm2 logs crawler-challenge
```

### 5. 配置防火墙

```bash
# Ubuntu 防火墙
ufw allow 3000/tcp
ufw enable

# 同时记得配置阿里云安全组（见上文）
```

---

## 方式三：Nginx 反向代理（使用 80 端口）

如果想用标准 HTTP 端口 (80)：

### 1. 安装 Nginx

```bash
apt install nginx -y
```

### 2. 配置反向代理

```bash
nano /etc/nginx/sites-available/crawler-challenge
```

写入以下内容:
```nginx
server {
    listen 80;
    server_name 你的域名或IP;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket 支持（排行榜实时更新）
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### 3. 启用配置

```bash
ln -s /etc/nginx/sites-available/crawler-challenge /etc/nginx/sites-enabled/
nginx -t  # 测试配置
systemctl restart nginx
```

### 4. 开放 80 端口

阿里云安全组添加:
- 端口: 80
- 协议: TCP
- 授权对象: 0.0.0.0/0

---

## 考试管理命令

### 重置数据库（清空所有提交记录）

```bash
cd /root/crawler-challenge
rm data/challenge.db
npm run init-db

# 如果使用 Docker
docker-compose exec crawler-challenge rm /app/data/challenge.db
docker-compose exec crawler-challenge npm run init-db
docker-compose restart
```

### 查看提交记录

```bash
sqlite3 data/challenge.db "SELECT team_id, level, score, submitted_at FROM submissions ORDER BY submitted_at DESC LIMIT 20"
```

### 查看蜜罐触发记录

```bash
sqlite3 data/challenge.db "SELECT * FROM honeypot_logs ORDER BY triggered_at DESC"
```

### 查看排行榜数据

```bash
sqlite3 data/challenge.db "
SELECT team_id, SUM(score) as total
FROM (SELECT team_id, level, MAX(score) as score FROM submissions GROUP BY team_id, level)
GROUP BY team_id
ORDER BY total DESC
"
```

### 修改测试账号密码

编辑 `src/utils/initDb.js`，修改这一行:
```javascript
const password = bcrypt.hashSync('新密码', 10);
```
然后重新初始化数据库。

---

## 常见问题

### Q: better-sqlite3 安装失败

```bash
apt install -y python3 make g++
npm rebuild better-sqlite3
```

### Q: 端口被占用

```bash
# 查看占用
lsof -i :3000

# 杀掉进程
kill -9 PID
```

### Q: WebSocket 不工作（排行榜不更新）

确保 Nginx 配置了 WebSocket 代理（见上文），或直接使用 3000 端口访问。

### Q: Docker 容器无法启动

```bash
# 查看详细日志
docker-compose logs --tail=50

# 重新构建
docker-compose down
docker-compose up -d --build
```

---

## 快速启动脚本

创建一键部署脚本:

```bash
nano /root/setup-crawler.sh
```

写入:
```bash
#!/bin/bash
set -e

echo "=== 安装 Docker ==="
curl -fsSL https://get.docker.com | sh
systemctl start docker
systemctl enable docker
apt install -y docker-compose

echo "=== 启动服务 ==="
cd /root/crawler-challenge
docker-compose up -d --build

echo "=== 完成 ==="
echo "访问: http://$(curl -s ifconfig.me):3000"
```

执行:
```bash
chmod +x /root/setup-crawler.sh
./setup-crawler.sh
```

---

## 服务器配置建议

| 配置 | 最低要求 | 推荐配置 |
|------|----------|----------|
| CPU | 1核 | 2核 |
| 内存 | 1GB | 2GB |
| 硬盘 | 20GB | 40GB |
| 带宽 | 1Mbps | 5Mbps |

对于 20 人同时参加的考试，1核2G 的配置足够。
