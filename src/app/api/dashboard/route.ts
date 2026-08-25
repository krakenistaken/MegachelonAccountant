// src/app/api/dashboard/route.ts
import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';

export async function GET() {
  try {
    await initializeDatabase();
    const db = getDb();

    // Current month prefix YYYY-MM
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Parallel query execution
    const [totalIncRs, totalExpRs, accountsRs, recentTxRs, monthIncRs, monthExpRs] = await Promise.all([
      db.execute("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'Gelir'"),
      db.execute("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'Gider'"),
      db.execute('SELECT id, name, balance FROM accounts ORDER BY name'),
      db.execute(`
        SELECT 
          t.id, t.type, t.amount, t.currency, t.transaction_date, t.description, t.created_at,
          c.name as category_name,
          a.name as account_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        ORDER BY t.created_at DESC
        LIMIT 10
      `),
      db.execute({
        sql: "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'Gelir' AND transaction_date LIKE ?",
        args: [`${currentMonth}%`],
      }),
      db.execute({
        sql: "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'Gider' AND transaction_date LIKE ?",
        args: [`${currentMonth}%`],
      }),
    ]);

    const totalIncome = Number(totalIncRs.rows[0]?.total || 0);
    const totalExpense = Number(totalExpRs.rows[0]?.total || 0);
    const netBalance = totalIncome - totalExpense;

    const monthlyIncome = Number(monthIncRs.rows[0]?.total || 0);
    const monthlyExpense = Number(monthExpRs.rows[0]?.total || 0);

    return NextResponse.json({
      totalIncome,
      totalExpense,
      netBalance,
      accounts: accountsRs.rows,
      recentTransactions: recentTxRs.rows,
      monthlyIncome,
      monthlyExpense,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
