// src/app/api/reports/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';

let initialized = false;
function ensureInit() {
  if (!initialized) {
    initializeDatabase();
    initialized = true;
  }
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getPeriodDates(period: string, customFrom?: string | null, customTo?: string | null) {
  const now = new Date();
  const currentDayOfWeek = (now.getDay() + 6) % 7; // 0 = Monday, 6 = Sunday

  let dateFrom = '';
  let dateTo = '';
  let prevDateFrom = '';
  let prevDateTo = '';
  let periodLabel = '';

  switch (period) {
    case 'this_week': {
      const mon = new Date(now);
      mon.setDate(now.getDate() - currentDayOfWeek);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);

      dateFrom = formatDateStr(mon);
      dateTo = formatDateStr(sun);

      const prevMon = new Date(mon);
      prevMon.setDate(mon.getDate() - 7);
      const prevSun = new Date(prevMon);
      prevSun.setDate(prevMon.getDate() + 6);

      prevDateFrom = formatDateStr(prevMon);
      prevDateTo = formatDateStr(prevSun);
      periodLabel = 'Bu Hafta';
      break;
    }
    case 'last_week': {
      const lastMon = new Date(now);
      lastMon.setDate(now.getDate() - currentDayOfWeek - 7);
      const lastSun = new Date(lastMon);
      lastSun.setDate(lastMon.getDate() + 6);

      dateFrom = formatDateStr(lastMon);
      dateTo = formatDateStr(lastSun);

      const twoWeeksMon = new Date(lastMon);
      twoWeeksMon.setDate(lastMon.getDate() - 7);
      const twoWeeksSun = new Date(twoWeeksMon);
      twoWeeksSun.setDate(twoWeeksMon.getDate() + 6);

      prevDateFrom = formatDateStr(twoWeeksMon);
      prevDateTo = formatDateStr(twoWeeksSun);
      periodLabel = 'Geçen Hafta';
      break;
    }
    case 'last_month': {
      const year = now.getFullYear();
      const month = now.getMonth(); // current 0-indexed month

      const firstOfLastMonth = new Date(year, month - 1, 1);
      const lastOfLastMonth = new Date(year, month, 0);

      dateFrom = formatDateStr(firstOfLastMonth);
      dateTo = formatDateStr(lastOfLastMonth);

      const firstOfTwoMonthsAgo = new Date(year, month - 2, 1);
      const lastOfTwoMonthsAgo = new Date(year, month - 1, 0);

      prevDateFrom = formatDateStr(firstOfTwoMonthsAgo);
      prevDateTo = formatDateStr(lastOfTwoMonthsAgo);
      periodLabel = 'Geçen Ay';
      break;
    }
    case 'this_year': {
      const year = now.getFullYear();
      dateFrom = `${year}-01-01`;
      dateTo = `${year}-12-31`;

      prevDateFrom = `${year - 1}-01-01`;
      prevDateTo = `${year - 1}-12-31`;
      periodLabel = 'Bu Yıl';
      break;
    }
    case 'custom': {
      dateFrom = customFrom || formatDateStr(now);
      dateTo = customTo || formatDateStr(now);
      periodLabel = 'Özel Tarih Aralığı';
      break;
    }
    case 'this_month':
    default: {
      const year = now.getFullYear();
      const month = now.getMonth();

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      dateFrom = formatDateStr(firstDay);
      dateTo = formatDateStr(lastDay);

      const prevFirstDay = new Date(year, month - 1, 1);
      const prevLastDay = new Date(year, month, 0);

      prevDateFrom = formatDateStr(prevFirstDay);
      prevDateTo = formatDateStr(prevLastDay);
      periodLabel = 'Bu Ay';
      break;
    }
  }

  return { dateFrom, dateTo, prevDateFrom, prevDateTo, periodLabel };
}

export async function GET(request: NextRequest) {
  try {
    ensureInit();
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const period = searchParams.get('period') || 'this_month';
    const customFrom = searchParams.get('date_from');
    const customTo = searchParams.get('date_to');

    const { dateFrom, dateTo, prevDateFrom, prevDateTo, periodLabel } = getPeriodDates(
      period,
      customFrom,
      customTo
    );

    // 1. Current Period Totals
    const currentIncome = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total, COUNT(id) as count FROM transactions WHERE type = 'Gelir' AND transaction_date BETWEEN ? AND ?"
      )
      .get(dateFrom, dateTo) as { total: number; count: number };

    const currentExpense = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total, COUNT(id) as count FROM transactions WHERE type = 'Gider' AND transaction_date BETWEEN ? AND ?"
      )
      .get(dateFrom, dateTo) as { total: number; count: number };

    const totalIncome = currentIncome.total;
    const totalExpense = currentExpense.total;
    const netProfit = totalIncome - totalExpense;
    const transactionCount = currentIncome.count + currentExpense.count;

    // 2. Previous Period Totals (for comparison)
    let prevIncome = 0;
    let prevExpense = 0;
    let incomeGrowthRate: number | null = null;
    let expenseGrowthRate: number | null = null;

    if (prevDateFrom && prevDateTo) {
      const prevIncomeRow = db
        .prepare(
          "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'Gelir' AND transaction_date BETWEEN ? AND ?"
        )
        .get(prevDateFrom, prevDateTo) as { total: number };

      const prevExpenseRow = db
        .prepare(
          "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'Gider' AND transaction_date BETWEEN ? AND ?"
        )
        .get(prevDateFrom, prevDateTo) as { total: number };

      prevIncome = prevIncomeRow.total;
      prevExpense = prevExpenseRow.total;

      if (prevIncome > 0) {
        incomeGrowthRate = ((totalIncome - prevIncome) / prevIncome) * 100;
      }
      if (prevExpense > 0) {
        expenseGrowthRate = ((totalExpense - prevExpense) / prevExpense) * 100;
      }
    }

    // 3. Category Breakdown (Expenses & Income)
    const categoryStats = db
      .prepare(
        `SELECT 
          c.id, c.name, c.type,
          COALESCE(SUM(t.amount), 0) as total,
          COUNT(t.id) as count
        FROM categories c
        LEFT JOIN transactions t ON c.id = t.category_id AND t.transaction_date BETWEEN ? AND ?
        GROUP BY c.id
        HAVING total > 0
        ORDER BY total DESC`
      )
      .all(dateFrom, dateTo) as Array<{
        id: number;
        name: string;
        type: string;
        total: number;
        count: number;
      }>;

    const expenseCategories = categoryStats
      .filter((c) => c.type === 'Gider')
      .map((c) => ({
        ...c,
        percentage: totalExpense > 0 ? (c.total / totalExpense) * 100 : 0,
      }));

    const incomeCategories = categoryStats
      .filter((c) => c.type === 'Gelir')
      .map((c) => ({
        ...c,
        percentage: totalIncome > 0 ? (c.total / totalIncome) * 100 : 0,
      }));

    // 4. Accounts Snapshot & Inflow/Outflow for the period
    const accountsData = db
      .prepare(
        `SELECT 
          a.id, a.name, a.balance,
          COALESCE(SUM(CASE WHEN t.type = 'Gelir' THEN t.amount ELSE 0 END), 0) as inflow,
          COALESCE(SUM(CASE WHEN t.type = 'Gider' THEN t.amount ELSE 0 END), 0) as outflow
        FROM accounts a
        LEFT JOIN transactions t ON a.id = t.account_id AND t.transaction_date BETWEEN ? AND ?
        GROUP BY a.id
        ORDER BY a.name`
      )
      .all(dateFrom, dateTo) as Array<{
        id: number;
        name: string;
        balance: number;
        inflow: number;
        outflow: number;
      }>;

    const accounts = accountsData.map((a) => ({
      ...a,
      net: a.inflow - a.outflow,
    }));

    // 5. Time Series / Intervals for Bar Charts
    const txByDate = db
      .prepare(
        `SELECT 
          transaction_date,
          COALESCE(SUM(CASE WHEN type = 'Gelir' THEN amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN type = 'Gider' THEN amount ELSE 0 END), 0) as expense
        FROM transactions
        WHERE transaction_date BETWEEN ? AND ?
        GROUP BY transaction_date
        ORDER BY transaction_date ASC`
      )
      .all(dateFrom, dateTo) as Array<{
        transaction_date: string;
        income: number;
        expense: number;
      }>;

    // Fill in dates for complete chart timeline
    const dateMap = new Map<string, { income: number; expense: number }>();
    txByDate.forEach((r) => dateMap.set(r.transaction_date, { income: r.income, expense: r.expense }));

    const chartPoints: Array<{
      date: string;
      label: string;
      income: number;
      expense: number;
      net: number;
    }> = [];

    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    const cur = new Date(start);

    // If span is more than 60 days, we don't necessarily generate every single day, but for month/week we do
    const dayDiff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    if (dayDiff <= 35) {
      // Daily points
      while (cur <= end) {
        const dStr = formatDateStr(cur);
        const [, m, d] = dStr.split('-');
        const val = dateMap.get(dStr) || { income: 0, expense: 0 };
        chartPoints.push({
          date: dStr,
          label: `${d}.${m}`,
          income: val.income,
          expense: val.expense,
          net: val.income - val.expense,
        });
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      // Monthly or aggregated points
      txByDate.forEach((r) => {
        const [, m, d] = r.transaction_date.split('-');
        chartPoints.push({
          date: r.transaction_date,
          label: `${d}.${m}`,
          income: r.income,
          expense: r.expense,
          net: r.income - r.expense,
        });
      });
    }

    // 6. Full transactions list for this period
    const transactions = db
      .prepare(
        `SELECT 
          t.id, t.type, t.amount, t.currency, t.transaction_date, t.description,
          c.name as category_name,
          a.name as account_name,
          u.username as created_by
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        LEFT JOIN users u ON t.created_by_user_id = u.id
        WHERE t.transaction_date BETWEEN ? AND ?
        ORDER BY t.transaction_date DESC, t.created_at DESC`
      )
      .all(dateFrom, dateTo);

    return NextResponse.json({
      period,
      periodLabel,
      dateFrom,
      dateTo,
      prevDateFrom,
      prevDateTo,
      summary: {
        totalIncome,
        totalExpense,
        netProfit,
        transactionCount,
        prevIncome,
        prevExpense,
        incomeGrowthRate,
        expenseGrowthRate,
      },
      expenseCategories,
      incomeCategories,
      accounts,
      chartPoints,
      transactions,
    });
  } catch (error) {
    console.error('Reports API error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
