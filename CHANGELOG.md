# 更新日志

## 2025-01-15 - 考试系统优化

### 主要改进

1. **术语统一**
   - 将 `team_id` 全局替换为 `task_id`，避免个人考试场景中的术语歧义
   - 界面中"队伍ID"改为"考试ID"

2. **动态考生注册**
   - 新增 `tasks` 表记录考生注册信息
   - 新增 `POST /api/register` 端点
   - 考生自主输入姓名获取唯一 `task_id`
   - task_id 格式: `task_` + 6位随机字符（如 task_a1b2c3）
   - 支持重复注册检测，返回已存在的 task_id

3. **排行榜优化**
   - 显示考生姓名（从 tasks 表关联）
   - 显示首次提交时间、最新提交时间
   - 自动计算并显示耗时（分秒格式）
   - 移除全局倒计时（不准确）

4. **首页改进**
   - 移除60分钟倒计时器（刷新会重置）
   - 添加考生注册模块
   - 注册信息保存在 localStorage，刷新不丢失
   - 支持重复访问提示

5. **关卡页面增强**
   - 在所有关卡页面添加任务说明模块
   - 包含任务描述、数据格式、提示信息
   - 考生无需额外查看文档

### 数据库变更

**新增表：**
```sql
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT UNIQUE NOT NULL,
  name TEXT UNIQUE NOT NULL,
  registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**新增索引：**
```sql
CREATE INDEX idx_task_level ON submissions(task_id, level);
CREATE INDEX idx_task_submitted ON submissions(task_id, submitted_at);
CREATE INDEX idx_task_name ON tasks(name);
```

**字段修改：**
- `submissions.team_id` → `submissions.task_id`
- `honeypot_logs.team_id` → `honeypot_logs.task_id`

### API 变更

**新增端点：**
- `POST /api/register` - 考生注册

**修改端点：**
- `POST /api/submit` - 参数从 `team_id` 改为 `task_id`
- `GET /api/leaderboard` - 返回数据增加 `name`, `first_submission`, `elapsed_time`

### 向后兼容性

- 旧的 task_id（如 team01-team20）仍可正常使用
- 排行榜使用 LEFT JOIN，未注册的 task_id 也能显示（姓名显示为 `-`）

### 文件修改清单

**数据库：**
- `src/utils/initDb.js` - 添加 tasks 表和索引

**后端路由：**
- `src/routes/api.js` - 添加注册端点，team_id → task_id
- `src/routes/scoreboard.js` - JOIN tasks 表，计算耗时
- `src/routes/level2.js` - team_id → task_id
- `src/routes/level3.js` - team_id → task_id
- `src/routes/level4.js` - team_id → task_id

**前端视图：**
- `views/index.ejs` - 移除倒计时，添加注册模块
- `views/scoreboard.ejs` - 显示姓名、时间、耗时
- `views/level1/index.ejs` - 添加任务描述
- `views/level2/index.ejs` - 添加任务描述
- `views/level3/login.ejs` - 添加任务描述
- `views/level4/index.ejs` - 添加任务描述

### 部署步骤

```bash
cd /path/to/crawler-challenge

# 拉取最新代码
git pull

# 停止并删除旧容器
docker compose down

# 清空旧数据库（可选，会丢失所有提交记录）
# rm -rf ./data/*

# 重新构建并启动
docker compose up -d --build

# 查看日志确认启动成功
docker compose logs -f
```

### 测试验证

1. 访问首页，输入姓名注册，获取 task_id
2. 刷新页面，确认 task_id 保持不变
3. 访问各关卡，确认任务描述正确显示
4. 提交测试数据，确认 task_id 正确记录
5. 访问排行榜，确认姓名、时间、耗时正确显示
