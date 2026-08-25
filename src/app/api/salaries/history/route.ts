// src/app/api/salaries/history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { verifySession } from '@/lib/auth';

// GET: List all salary and attendance transaction history
export async function GET(request: NextRequest) {
  try {
    await initializeDatabase();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);

    const employeeIdParam = searchParams.get('employee_id');
    const startDateParam = searchParams.get('start_date');
    const endDateParam = searchParams.get('end_date');
    const accountIdParam = searchParams.get('account_id');
    const paymentStatusParam = searchParams.get('payment_status'); // 'paid', 'unpaid', 'partial'

    let whereClauses: string[] = [];
    let args: (string | number)[] = [];

    if (employeeIdParam) {
      whereClauses.push('a.employee_id = ?');
      args.push(Number(employeeIdParam));
    }

    if (startDateParam) {
      whereClauses.push('a.date >= ?');
      args.push(startDateParam);
    }

    if (endDateParam) {
      whereClauses.push('a.date <= ?');
      args.push(endDateParam);
    }

    if (accountIdParam) {
      whereClauses.push('a.account_id = ?');
      args.push(Number(accountIdParam));
    }

    if (paymentStatusParam === 'paid') {
      whereClauses.push('(a.paid_amount >= a.daily_wage AND a.daily_wage > 0)');
    } else if (paymentStatusParam === 'partial') {
      whereClauses.push('(a.paid_amount > 0 AND a.paid_amount < a.daily_wage)');
    } else if (paymentStatusParam === 'unpaid') {
      whereClauses.push('(a.paid_amount = 0 OR a.paid_amount IS NULL) AND a.status IN (\'Geldi\', \'Yarım Gün\')');
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT 
        a.id as attendance_id,
        a.employee_id,
        e.first_name,
        e.last_name,
        e.phone as employee_phone,
        a.date as attendance_date,
        a.status as attendance_status,
        a.daily_wage,
        a.is_paid,
        COALESCE(a.paid_amount, CASE WHEN a.is_paid = 1 THEN a.daily_wage ELSE 0 END) as paid_amount,
        a.account_id,
        acc.name as account_name,
        a.transaction_id,
        a.note,
        a.created_at,
        a.updated_at,
        t.amount as transaction_amount,
        t.transaction_date,
        t.description as transaction_description,
        u.username as created_by_username
      FROM attendances a
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN accounts acc ON a.account_id = acc.id
      LEFT JOIN transactions t ON a.transaction_id = t.id
      LEFT JOIN users u ON t.created_by_user_id = u.id
      ${whereSql}
      ORDER BY a.date DESC, a.updated_at DESC
    `;

    const recordsRs = await db.execute({
      sql: query,
      args,
    });

    const rows = recordsRs.rows as unknown as Array<{
      attendance_id: number;
      employee_id: number;
      first_name: string;
      last_name: string;
      employee_phone: string | null;
      attendance_date: string;
      attendance_status: string;
      daily_wage: number;
      is_paid: number;
      paid_amount: number;
      account_id: number | null;
      account_name: string | null;
      transaction_id: number | null;
      note: string | null;
      created_at: string;
      updated_at: string;
      transaction_amount: number | null;
      transaction_date: string | null;
      transaction_description: string | null;
      created_by_username: string | null;
    }>;

    // Format and classify records
    const history = rows.map((r) => {
      const dailyWage = Number(r.daily_wage || 0);
      const paidAmount = Number(r.paid_amount || 0);
      const isWorking = r.attendance_status === 'Geldi' || r.attendance_status === 'Yarım Gün';
      const remainingDue = isWorking ? Math.max(0, dailyWage - paidAmount) : 0;

      let paymentCategory: 'full' | 'partial' | 'unpaid' | 'absent' = 'absent';
      if (r.attendance_status === 'Gelmedi') {
        paymentCategory = 'absent';
      } else if (paidAmount >= dailyWage && dailyWage > 0) {
        paymentCategory = 'full';
      } else if (paidAmount > 0) {
        paymentCategory = 'partial';
      } else {
        paymentCategory = 'unpaid';
      }

      return {
        ...r,
        daily_wage: dailyWage,
        paid_amount: paidAmount,
        remaining_due: remainingDue,
        payment_category: paymentCategory,
      };
    });

    // Calculate Summary Stats
    const totalWageEarned = history
      .filter((h) => h.attendance_status === 'Geldi' || h.attendance_status === 'Yarım Gün')
      .reduce((sum, h) => sum + h.daily_wage, 0);

    const totalPaidAmount = history.reduce((sum, h) => sum + h.paid_amount, 0);
    const totalRemainingDue = totalWageEarned - totalPaidAmount;
    const paidFromAccounts = history
      .filter((h) => h.account_id && h.paid_amount > 0)
      .reduce((sum, h) => sum + h.paid_amount, 0);
    const paidExternally = totalPaidAmount - paidFromAccounts;

    return NextResponse.json({
      history,
      summary: {
        totalRecords: history.length,
        totalWageEarned,
        totalPaidAmount,
        totalRemainingDue,
        paidFromAccounts,
        paidExternally,
      },
    });
  } catch (error) {
    console.error('Salaries History GET error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
