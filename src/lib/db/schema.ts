// src/lib/db/schema.ts
// Database schema initialization and seed data
import getDb from '../db';
import bcrypt from 'bcryptjs';

export function initializeDatabase() {
  const db = getDb();

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'admin',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL,
      type  TEXT NOT NULL CHECK(type IN ('Gelir', 'Gider'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      name    TEXT UNIQUE NOT NULL,
      balance REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS currencies (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      code          TEXT UNIQUE NOT NULL,
      symbol        TEXT NOT NULL,
      exchange_rate REAL NOT NULL DEFAULT 1.0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      type               TEXT NOT NULL CHECK(type IN ('Gelir', 'Gider')),
      category_id        INTEGER NOT NULL REFERENCES categories(id),
      account_id         INTEGER NOT NULL REFERENCES accounts(id),
      currency           TEXT NOT NULL DEFAULT 'TRY',
      amount             REAL NOT NULL,
      transaction_date   TEXT NOT NULL,
      description        TEXT,
      created_by_user_id INTEGER NOT NULL REFERENCES users(id),
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employees (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name  TEXT NOT NULL,
      last_name   TEXT NOT NULL,
      daily_wage  REAL NOT NULL DEFAULT 0,
      phone       TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendances (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date           TEXT NOT NULL,
      status         TEXT NOT NULL CHECK(status IN ('Geldi', 'Gelmedi')) DEFAULT 'Geldi',
      daily_wage     REAL NOT NULL DEFAULT 0,
      is_paid        INTEGER NOT NULL DEFAULT 0,
      paid_amount    REAL NOT NULL DEFAULT 0,
      account_id     INTEGER REFERENCES accounts(id),
      transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
      note           TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(employee_id, date)
    );
  `);

  // Ensure paid_amount column exists on attendances if table existed previously
  try {
    db.exec(`ALTER TABLE attendances ADD COLUMN paid_amount REAL DEFAULT 0;`);
  } catch {
    // column already exists
  }

  // Seed default data if tables are empty
  seedData(db);
}

function seedData(db: ReturnType<typeof getDb>) {
  // Check if admin user already exists
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  
  if (userCount.count === 0) {
    // Default admin user: admin / admin123
    const passwordHash = bcrypt.hashSync('admin123', 12);
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(
      'admin',
      passwordHash,
      'admin'
    );
    console.log('✅ Default admin user created (admin / admin123)');
  }

  // Seed categories
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
  if (catCount.count === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name, type) VALUES (?, ?)');
    const seedCategories = db.transaction(() => {
      // Gelir kategorileri
      insertCat.run('Satış', 'Gelir');
      insertCat.run('Hizmet Geliri', 'Gelir');
      insertCat.run('Faiz Geliri', 'Gelir');
      insertCat.run('Diğer Gelir', 'Gelir');
      // Gider kategorileri
      insertCat.run('Maaş', 'Gider');
      insertCat.run('Kira', 'Gider');
      insertCat.run('Fatura', 'Gider');
      insertCat.run('Malzeme', 'Gider');
      insertCat.run('Ulaşım', 'Gider');
      insertCat.run('Diğer Gider', 'Gider');
    });
    seedCategories();
    console.log('✅ Default categories seeded');
  }

  // Seed accounts (kasalar)
  const accCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get() as { count: number };
  if (accCount.count === 0) {
    const insertAcc = db.prepare('INSERT INTO accounts (name, balance) VALUES (?, ?)');
    insertAcc.run('Ana Kasa', 0);
    insertAcc.run('Banka Hesabı', 0);
    console.log('✅ Default accounts seeded');
  }

  // Seed currencies
  const curCount = db.prepare('SELECT COUNT(*) as count FROM currencies').get() as { count: number };
  if (curCount.count === 0) {
    const insertCur = db.prepare('INSERT INTO currencies (code, symbol, exchange_rate) VALUES (?, ?, ?)');
    insertCur.run('TRY', '₺', 1.0);
    insertCur.run('USD', '$', 34.5);
    insertCur.run('EUR', '€', 37.2);
    console.log('✅ Default currencies seeded');
  }
}
