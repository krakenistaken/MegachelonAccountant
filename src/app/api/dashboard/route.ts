// src/app/api/dashboard/route.ts
import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';

let initialized = false;
function ensureInit() {
  if (!initialized) {
    initializeDatabase();
    initialized = true;
  }
}

export async function GET() {
  try {
    ensureInit();
    const db = getDb();

    // Total income
    const totalIncome = db
      .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'Gelir'")
      .get() as { total: number };

    // Total expense
    const totalExpense = db
      .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'Gider'")
      .get() as { total: number };

    // Net balance
    const netBalance = totalIncome.total - totalExpense.total;

    // Account balances
    const accounts = db.prepare('SELECT id, name, balance FROM accounts ORDER BY name').all();

    // Recent transactions (last 10)
    const recentTransactions = db
      .prepare(`
        SELECT 
          t.id, t.type, t.amount, t.currency, t.transaction_date, t.description, t.created_at,
          c.name as category_name,
          a.name as account_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        ORDER BY t.created_at DESC
        LIMIT 10
      `)
      .all();

    // Monthly summary (current month)
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const monthlyIncome = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'Gelir' AND transaction_date LIKE ?"
      )
      .get(`${currentMonth}%`) as { total: number };

    const monthlyExpense = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'Gider' AND transaction_date LIKE ?"
      )
      .get(`${currentMonth}%`) as { total: number };

    return NextResponse.json({
      totalIncome: totalIncome.total,
      totalExpense: totalExpense.total,
      netBalance,
      accounts,
      recentTransactions,
      monthlyIncome: monthlyIncome.total,
      monthlyExpense: monthlyExpense.total,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
