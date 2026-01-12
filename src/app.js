const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');

// Routes
const level1Routes = require('./routes/level1');
const level2Routes = require('./routes/level2');
const level3Routes = require('./routes/level3');
const level4Routes = require('./routes/level4');
const apiRoutes = require('./routes/api');
const scoreboardRoutes = require('./routes/scoreboard');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Make io accessible to routes
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Request logging (for debugging)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/level1', level1Routes);
app.use('/level2', level2Routes);
app.use('/level3', level3Routes);
app.use('/level4', level4Routes);
app.use('/api', apiRoutes);
app.use('/scoreboard', scoreboardRoutes);

// Home page
app.get('/', (req, res) => {
  res.render('index');
});

// WebSocket for real-time scoreboard
io.on('connection', (socket) => {
  console.log('Scoreboard client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║       🕷️  Crawler Challenge Platform Started  🕷️          ║
╠═══════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}                 ║
║                                                           ║
║  Levels:                                                  ║
║    /level1  - Static HTML (15 points)                     ║
║    /level2  - Pagination + AJAX (25 points)               ║
║    /level3  - Login + Headers (25 points)                 ║
║    /level4  - Headless + Captcha (35 points)              ║
║                                                           ║
║  /scoreboard - Real-time Leaderboard                      ║
║  /api/submit - Submit answers                             ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

module.exports = { app, io };
