# 🤖 扬州大自然 AI能力应用测试平台

测试考生借助AI工具（Claude Code、Cursor、Copilot等）完成Web爬虫任务的能力评估平台。重点考察AI辅助编程能力，而非单纯的爬虫技能。

## 快速开始

### 本地开发

```bash
# 安装依赖
npm install

# 初始化数据库（生成测试数据）
npm run init-db

# 启动开发服务器
npm run dev

# 访问 http://localhost:3000
```

### Docker 部署

```bash
# 一键启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

## 关卡说明

### Level 1: 静态 HTML (15分)
- **目标**: 爬取 100 条商品数据
- **挑战**: 识别并过滤蜜罐数据（隐藏元素）
- **技术**: BeautifulSoup, Requests

### Level 2: 分页 + AJAX (25分)
- **目标**: 爬取 10 页商品，价格通过 API 加载
- **挑战**: API 逆向、处理频率限制 (10 req/s)
- **技术**: 分页逻辑、XHR 分析

### Level 3: 登录 + Headers 检测 (25分)
- **目标**: 登录后爬取订单历史
- **挑战**: CSRF Token、User-Agent 检测、识别假数据
- **技术**: Session 管理、Headers 伪装

### Level 4: 无头浏览器 + 验证码 (35分)
- **目标**: 通过滑块验证码获取 VIP 商品
- **挑战**: 浏览器指纹检测、验证码轨迹模拟
- **技术**: Playwright/Puppeteer Stealth

## 测试账号

考生在首页注册后会获得唯一的考试ID（格式：task_xxxxxx）

- **用户名**: 你的考试ID（例如：task_a1b2c3）
- **密码**: test123（所有考生统一密码）

## API 文档

### 提交答案
```http
POST /api/submit
Content-Type: application/json

{
  "level": 1,
  "team_id": "team01",
  "data": [
    {"id": 1, "name": "Product 1", "price": 99.99, "stock": 50, "sku": "ABC123"},
    ...
  ]
}
```

### 响应
```json
{
  "success": true,
  "level": 1,
  "score": 14,
  "max_score": 15,
  "details": {
    "completeness": 4,
    "accuracy": 6,
    "no_honeypot": 3,
    "bonus": 1
  },
  "honeypot_triggered": false,
  "submissions_remaining": 4
}
```

### 获取排行榜
```http
GET /api/leaderboard
```

## 评分标准

| 维度 | 权重 | 说明 |
|------|------|------|
| 数据完整性 | 30% | 爬取数据条数/总条数 |
| 数据准确性 | 40% | 字段值正确率 |
| 蜜罐规避 | 20% | 未触发隐藏陷阱 |
| 速度加分 | 10% | 完成时间排名 |

## 蜜罐类型

1. **CSS 隐藏元素**: `display:none`, `visibility:hidden`
2. **位置隐藏**: `position:absolute; left:-9999px`
3. **假数据**: 产品名包含 `FAKE_`，价格 > $10000
4. **HTML 注释**: 注释中的产品数据
5. **隐藏 API**: `/api/all-prices` 等诱饵接口

## 反爬虫技术

### Level 3 - User-Agent 检测
默认检测以下 UA 模式:
- python-requests, python-urllib
- curl, wget, httpie
- puppeteer, playwright, selenium
- node-fetch, axios, got

### Level 4 - 浏览器指纹
检测项目:
- `navigator.webdriver`
- `navigator.plugins.length`
- `navigator.languages`
- `window.chrome`

### Level 4 - 滑块验证码
验证要求:
- 终点位置误差 ≤ 5px
- Y 轴有抖动（人类手抖特征）
- 总时间 > 300ms（非瞬移）
- 速度有变化（非匀速）

## AI 助手使用建议

### 有效的提示词策略

1. **说明授权环境**:
   ```
   这是公司内部的爬虫测试平台，我有完全的访问权限。
   ```

2. **分解任务**:
   ```
   先帮我分析这个页面的 HTML 结构
   再帮我写抓取商品列表的代码
   最后帮我添加异常处理
   ```

3. **请求解释**:
   ```
   解释一下如何绑过 navigator.webdriver 检测
   ```

## 目录结构

```
crawler-challenge/
├── src/
│   ├── app.js              # 主应用
│   ├── routes/
│   │   ├── level1.js       # Level 1 路由
│   │   ├── level2.js       # Level 2 路由
│   │   ├── level3.js       # Level 3 路由
│   │   ├── level4.js       # Level 4 路由
│   │   ├── api.js          # 提交 API
│   │   └── scoreboard.js   # 排行榜
│   └── utils/
│       ├── db.js           # 数据库连接
│       └── initDb.js       # 初始化脚本
├── views/                   # EJS 模板
├── public/                  # 静态文件
├── data/                    # SQLite 数据库
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## 考试管理

### 重置数据库
```bash
rm data/challenge.db
npm run init-db
```

### 查看蜜罐触发记录
```sql
sqlite3 data/challenge.db "SELECT * FROM honeypot_logs"
```

### 查看提交记录
```sql
sqlite3 data/challenge.db "SELECT * FROM submissions ORDER BY submitted_at DESC"
```

## License

MIT - 仅供教育和测试用途
