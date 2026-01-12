const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, '../../data/challenge.db');
const db = new Database(dbPath);

console.log('Initializing database...');

// Create tables
db.exec(`
  -- Products table for Level 1, 2
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER NOT NULL,
    sku TEXT NOT NULL,
    category TEXT,
    is_honeypot INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Users table for Level 3
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    team_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Orders table for Level 3
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    total_price REAL NOT NULL,
    status TEXT NOT NULL,
    order_date DATETIME NOT NULL,
    is_fake INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- VIP Products for Level 4
  CREATE TABLE IF NOT EXISTS vip_products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    original_price REAL NOT NULL,
    sale_price REAL NOT NULL,
    discount_percent INTEGER NOT NULL,
    stock INTEGER NOT NULL,
    flash_sale_end DATETIME,
    secret_code TEXT NOT NULL
  );

  -- Submissions tracking
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY,
    team_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    score INTEGER NOT NULL,
    max_score INTEGER NOT NULL,
    details TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Honeypot triggers
  CREATE TABLE IF NOT EXISTS honeypot_logs (
    id INTEGER PRIMARY KEY,
    team_id TEXT,
    ip_address TEXT,
    trap_type TEXT NOT NULL,
    triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Session tokens for Level 3
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

console.log('Tables created successfully!');

// Generate test data
console.log('Generating test data...');

// Categories for products
const categories = ['Electronics', 'Clothing', 'Books', 'Home', 'Sports', 'Food'];
const adjectives = ['Premium', 'Deluxe', 'Basic', 'Pro', 'Ultra', 'Mini', 'Max', 'Lite'];
const nouns = ['Widget', 'Gadget', 'Device', 'Tool', 'Kit', 'Set', 'Pack', 'Box'];

// Generate 100 products for Level 1
const insertProduct = db.prepare(`
  INSERT INTO products (name, price, stock, sku, category, is_honeypot)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const products = [];
for (let i = 1; i <= 100; i++) {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const cat = categories[Math.floor(Math.random() * categories.length)];

  const product = {
    name: `${adj} ${noun} ${i}`,
    price: Math.round((Math.random() * 990 + 10) * 100) / 100,
    stock: Math.floor(Math.random() * 100),
    sku: uuidv4().substring(0, 8).toUpperCase(),
    category: cat,
    is_honeypot: i % 25 === 0 ? 1 : 0  // Every 25th is honeypot
  };

  products.push(product);
  insertProduct.run(product.name, product.price, product.stock, product.sku, product.category, product.is_honeypot);
}

console.log(`Generated ${products.length} products`);

// Generate 20 test users
const insertUser = db.prepare(`
  INSERT INTO users (username, password_hash, team_name)
  VALUES (?, ?, ?)
`);

const password = bcrypt.hashSync('test123', 10);
for (let i = 1; i <= 20; i++) {
  const username = `team${i.toString().padStart(2, '0')}`;
  const teamName = `Team ${String.fromCharCode(64 + i)}`;  // Team A, Team B, etc.
  insertUser.run(username, password, teamName);
}
console.log('Generated 20 test users (password: test123)');

// Generate orders for each user
const insertOrder = db.prepare(`
  INSERT INTO orders (user_id, product_name, quantity, total_price, status, order_date, is_fake)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const statuses = ['Completed', 'Shipped', 'Processing', 'Delivered'];
const users = db.prepare('SELECT id FROM users').all();

users.forEach(user => {
  const orderCount = 5 + Math.floor(Math.random() * 10);  // 5-14 orders per user

  for (let i = 0; i < orderCount; i++) {
    const product = products[Math.floor(Math.random() * products.length)];
    const qty = Math.floor(Math.random() * 5) + 1;
    const total = Math.round(product.price * qty * 100) / 100;
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const date = new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000);

    // 20% fake orders (for detecting UA spoofing)
    const isFake = Math.random() < 0.2 ? 1 : 0;

    insertOrder.run(
      user.id,
      isFake ? `FAKE_${product.name}` : product.name,
      qty,
      isFake ? total * 999 : total,  // Fake orders have absurd prices
      status,
      date.toISOString(),
      isFake
    );
  }
});
console.log('Generated orders for all users');

// Generate VIP products for Level 4
const insertVipProduct = db.prepare(`
  INSERT INTO vip_products (name, original_price, sale_price, discount_percent, stock, flash_sale_end, secret_code)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const vipProducts = [
  { name: 'RTX 5090 Graphics Card', orig: 1999.99, discount: 30 },
  { name: 'iPhone 17 Pro Max', orig: 1499.99, discount: 15 },
  { name: 'Sony PS6 Console', orig: 599.99, discount: 25 },
  { name: 'Apple Vision Pro 2', orig: 3499.99, discount: 20 },
  { name: 'Samsung 98" QLED TV', orig: 4999.99, discount: 35 },
  { name: 'DJI Drone Pro X', orig: 2199.99, discount: 22 },
  { name: 'Tesla Model Bot', orig: 9999.99, discount: 10 },
  { name: 'LG Rollable Phone', orig: 1799.99, discount: 28 },
  { name: 'Nvidia Shield Ultra', orig: 399.99, discount: 40 },
  { name: 'Razer Gaming Chair XL', orig: 899.99, discount: 33 }
];

vipProducts.forEach((p, i) => {
  const salePrice = Math.round(p.orig * (100 - p.discount) / 100 * 100) / 100;
  const endTime = new Date(Date.now() + (30 + i * 5) * 60 * 1000);  // Staggered end times
  const secretCode = `VIP${uuidv4().substring(0, 6).toUpperCase()}`;

  insertVipProduct.run(p.name, p.orig, salePrice, p.discount, Math.floor(Math.random() * 50) + 1, endTime.toISOString(), secretCode);
});
console.log('Generated 10 VIP flash sale products');

db.close();
console.log('\n✅ Database initialized successfully!');
console.log(`   Database file: ${dbPath}`);
console.log('\n📋 Test accounts:');
console.log('   Username: team01 - team20');
console.log('   Password: test123');
