// src/lib/db/schema.ts
// Database schema initialization and seed data for Turso / libSQL
import getDb from '../db';
import bcrypt from 'bcryptjs';

let initPromise: Promise<void> | null = null;

export async function initializeDatabase(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const db = getDb();

    // Create tables
    await db.executeMultiple(`
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
      await db.execute(`ALTER TABLE attendances ADD COLUMN paid_amount REAL DEFAULT 0;`);
    } catch {
      // Column already exists
    }

    // Seed default data if tables are empty
    await seedData(db);
  })();

  return initPromise;
}

async function seedData(db: ReturnType<typeof getDb>) {
  // Check if admin user already exists
  const userCount = await db.execute('SELECT COUNT(*) as count FROM users');
  const count = Number((userCount.rows[0] as unknown as { count: number })?.count || 0);

  if (count === 0) {
    const passwordHash = bcrypt.hashSync('admin123', 12);
    await db.execute({
      sql: 'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      args: ['admin', passwordHash, 'admin'],
    });
    console.log('✅ Default admin user created (admin / admin123)');
  }

  // Seed categories
  const catCountRs = await db.execute('SELECT COUNT(*) as count FROM categories');
  const catCount = Number((catCountRs.rows[0] as unknown as { count: number })?.count || 0);
  if (catCount === 0) {
    await db.batch(
      [
        { sql: 'INSERT INTO categories (name, type) VALUES (?, ?)', args: ['Satış', 'Gelir'] },
        { sql: 'INSERT INTO categories (name, type) VALUES (?, ?)', args: ['Hizmet Geliri', 'Gelir'] },
        { sql: 'INSERT INTO categories (name, type) VALUES (?, ?)', args: ['Faiz Geliri', 'Gelir'] },
        { sql: 'INSERT INTO categories (name, type) VALUES (?, ?)', args: ['Diğer Gelir', 'Gelir'] },
        { sql: 'INSERT INTO categories (name, type) VALUES (?, ?)', args: ['Maaş', 'Gider'] },
        { sql: 'INSERT INTO categories (name, type) VALUES (?, ?)', args: ['Kira', 'Gider'] },
        { sql: 'INSERT INTO categories (name, type) VALUES (?, ?)', args: ['Fatura', 'Gider'] },
        { sql: 'INSERT INTO categories (name, type) VALUES (?, ?)', args: ['Malzeme', 'Gider'] },
        { sql: 'INSERT INTO categories (name, type) VALUES (?, ?)', args: ['Ulaşım', 'Gider'] },
        { sql: 'INSERT INTO categories (name, type) VALUES (?, ?)', args: ['Diğer Gider', 'Gider'] },
      ],
      'write'
    );
    console.log('✅ Default categories seeded');
  }

  // Seed accounts (kasalar)
  const accCountRs = await db.execute('SELECT COUNT(*) as count FROM accounts');
  const accCount = Number((accCountRs.rows[0] as unknown as { count: number })?.count || 0);
  if (accCount === 0) {
    await db.batch(
      [
        { sql: 'INSERT INTO accounts (name, balance) VALUES (?, ?)', args: ['Ana Kasa', 0] },
        { sql: 'INSERT INTO accounts (name, balance) VALUES (?, ?)', args: ['Banka Hesabı', 0] },
      ],
      'write'
    );
    console.log('✅ Default accounts seeded');
  }

  // Seed currencies
  const curCountRs = await db.execute('SELECT COUNT(*) as count FROM currencies');
  const curCount = Number((curCountRs.rows[0] as unknown as { count: number })?.count || 0);
  if (curCount === 0) {
    await db.batch(
      [
        { sql: 'INSERT INTO currencies (code, symbol, exchange_rate) VALUES (?, ?, ?)', args: ['TRY', '₺', 1.0] },
        { sql: 'INSERT INTO currencies (code, symbol, exchange_rate) VALUES (?, ?, ?)', args: ['USD', '$', 34.5] },
        { sql: 'INSERT INTO currencies (code, symbol, exchange_rate) VALUES (?, ?, ?)', args: ['EUR', '€', 37.2] },
      ],
      'write'
    );
    console.log('✅ Default currencies seeded');
  }
}
