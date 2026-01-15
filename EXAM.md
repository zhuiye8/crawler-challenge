# 🕷️ 爬虫能力测试 - 考试说明

## 考试信息

- **时间限制**: 60 分钟
- **总分**: 100 分
- **允许工具**: Claude Code、Cursor、Copilot、任意编程语言、浏览器开发者工具、搜索引擎
- **禁止行为**: 与他人分享答案或代码

---

## 考试地址

```
http://[服务器IP]:3000
```

- 排行榜: `http://[服务器IP]:3000/scoreboard`
- 提交API: `http://[服务器IP]:3000/api/submit`

---

## 关卡说明

### Level 1: 静态商品页面 (15分)

**地址**: `/level1`

**任务**: 爬取页面上的所有商品数据

**要求提交的数据格式**:
```json
[
  {"id": 1, "name": "商品名", "price": 99.99, "stock": 50, "sku": "ABC123", "category": "Electronics"},
  ...
]
```

**提示**: 不是所有你能在HTML中看到的数据都应该被爬取...

---

### Level 2: 动态分页商品 (25分)

**地址**: `/level2`

**任务**: 爬取分布在 10 个分页上的商品数据（含价格）

**注意事项**:
- 商品价格通过 AJAX API 加载
- API 有频率限制 (10次/秒)
- 商品ID在 `data-id` 属性中

**要求提交的数据格式**: 同 Level 1

---

### Level 3: 登录后的订单数据 (25分)

**地址**: `/level3/login`

**任务**: 登录后爬取你的订单历史

**登录信息**:
- **用户名**: 你的考试ID（即注册时获得的 task_id，格式：task_xxxxxx）
- **密码**: test123（所有考生统一密码）

**挑战要点**:
1. 处理 CSRF Token
2. 维持登录 Session（Cookie管理）
3. 模拟真实浏览器请求头（User-Agent 检测）
4. 过滤陷阱数据（价格异常、FAKE_ 前缀等）

**要求提交的数据格式**:
```json
[
  {"id": 1, "product_name": "商品名", "quantity": 2, "total_price": 199.98, "status": "Completed"},
  ...
]
```

**重要提示**:
- ⚠️ 真实订单的价格不会超过 $10,000
- ⚠️ 商品名称不会有 "FAKE_" 前缀
- ⚠️ 使用真实浏览器的 User-Agent，避免被识别为爬虫

---

### Level 4: VIP限时抢购 (35分)

**地址**: `/level4`

**任务**: 通过验证后爬取 VIP 限时抢购商品数据

**挑战**:
1. 通过浏览器指纹检测
2. 完成滑块验证码
3. 获取商品数据

**要求提交的数据格式**:
```json
[
  {"id": 1, "name": "商品名", "original_price": 1999.99, "sale_price": 1399.99, "discount_percent": 30, "stock": 25},
  ...
]
```

**提示**:
- 你可能需要使用 Playwright 或 Puppeteer 的 stealth 模式
- 滑块验证码需要模拟人类的拖动轨迹

---

## 提交答案

### API 端点
```
POST http://[服务器IP]:3000/api/submit
Content-Type: application/json
```

### 请求格式
```json
{
  "level": 1,
  "team_id": "你的队伍ID",
  "data": [ ... 爬取的数据数组 ... ]
}
```

### 响应示例
```json
{
  "success": true,
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

### 提交限制
- 每个关卡最多提交 **5 次**
- 只计算最高得分

---

## 评分标准

| 维度 | 权重 | 说明 |
|------|------|------|
| 数据完整性 | 30% | 爬取到的数据条数 / 应爬取的总条数 |
| 数据准确性 | 40% | 各字段值的正确率 |
| 蜜罐规避 | 20% | 是否包含了不该爬取的假数据 |
| 速度加分 | 10% | 提交时间排名 |

---

## 参考代码框架

### Python + Requests (Level 1-2)
```python
import requests
from bs4 import BeautifulSoup

# 爬取数据
response = requests.get('http://[服务器IP]:3000/level1')
soup = BeautifulSoup(response.text, 'html.parser')

# 解析并提交
data = [...]  # 你的解析逻辑
result = requests.post('http://[服务器IP]:3000/api/submit', json={
    'level': 1,
    'team_id': 'team01',
    'data': data
})
print(result.json())
```

### Python + Playwright (Level 4)
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # 你的爬虫逻辑
    page.goto('http://[服务器IP]:3000/level4')
    # ...

    browser.close()
```

---

## 常见问题

**Q: 为什么我的得分不是满分？**
A: 检查是否：1) 爬取了所有数据 2) 数据格式是否正确 3) 是否包含了蜜罐数据

**Q: 什么是蜜罐数据？**
A: 页面上故意设置的陷阱数据，真实用户看不到但爬虫可能会抓取到

**Q: Level 3 的假数据怎么识别？**
A: 仔细观察数据特征，假数据有明显的异常

**Q: Level 4 验证码过不去？**
A: 确保你的滑动轨迹有 Y 轴的微小抖动，且不是瞬间完成的

---

## 排行榜

实时排行榜地址: `http://[服务器IP]:3000/scoreboard`

**祝你好运！** 🍀
