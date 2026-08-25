// src/app/api/salaries/attendance/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { verifySession } from '@/lib/auth';
import { sseManager } from '@/lib/sse';

// GET: Fetch attendance records for a specific date or for an employee's monthly calendar
export async function GET(request: NextRequest) {
  try {
    await initializeDatabase();
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const employeeIdParam = searchParams.get('employee_id');
    const monthParam = searchParams.get('month');

    // If employee_id is provided, return their full attendance for the month
    if (employeeIdParam) {
      const empId = Number(employeeIdParam);
      const month = monthParam || new Date().toISOString().slice(0, 7);
      const startDate = `${month}-01`;
      const [y, m] = month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

      const recordsRs = await db.execute({
        sql: `SELECT 
                a.id as attendance_id,
                a.employee_id,
                a.date,
                a.status,
                a.daily_wage,
                a.is_paid,
                COALESCE(a.paid_amount, CASE WHEN a.is_paid = 1 THEN a.daily_wage ELSE 0 END) as paid_amount,
                a.account_id,
                a.note,
                acc.name as account_name
              FROM attendances a
              LEFT JOIN accounts acc ON a.account_id = acc.id
              WHERE a.employee_id = ? AND a.date BETWEEN ? AND ?
              ORDER BY a.date ASC`,
        args: [empId, startDate, endDate],
      });

      const empRs = await db.execute({
        sql: 'SELECT id, first_name, last_name, daily_wage, phone, is_active FROM employees WHERE id = ?',
        args: [empId],
      });

      return NextResponse.json({
        employee: empRs.rows[0],
        month,
        startDate,
        endDate,
        records: recordsRs.rows,
      });
    }

    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Fetch all active employees (or inactive ones who have attendance on this date) joined with attendance
    const query = `
      SELECT 
        e.id as employee_id,
        e.first_name,
        e.last_name,
        e.daily_wage as default_daily_wage,
        e.is_active,
        a.id as attendance_id,
        a.date,
        a.status,
        COALESCE(a.daily_wage, e.daily_wage) as daily_wage,
        COALESCE(a.is_paid, 0) as is_paid,
        COALESCE(a.paid_amount, CASE WHEN a.is_paid = 1 THEN COALESCE(a.daily_wage, e.daily_wage) ELSE 0 END) as paid_amount,
        a.account_id,
        a.transaction_id,
        a.note,
        acc.name as account_name
      FROM employees e
      LEFT JOIN attendances a ON e.id = a.employee_id AND a.date = ?
      LEFT JOIN accounts acc ON a.account_id = acc.id
      WHERE e.is_active = 1 OR a.id IS NOT NULL
      ORDER BY e.first_name ASC, e.last_name ASC
    `;

    const recordsRs = await db.execute({
      sql: query,
      args: [date],
    });

    const records = recordsRs.rows as unknown as Array<{
      employee_id: number;
      first_name: string;
      last_name: string;
      default_daily_wage: number;
      is_active: number;
      attendance_id: number | null;
      date: string | null;
      status: string | null;
      daily_wage: number;
      is_paid: number;
      paid_amount: number;
      account_id: number | null;
      transaction_id: number | null;
      note: string | null;
      account_name: string | null;
    }>;

    // Calculate daily summary stats
    const totalEmployees = records.length;
    const presentCount = records.filter((r) => r.status === 'Geldi').length;
    const halfDayCount = records.filter((r) => r.status === 'Yarım Gün').length;
    const absentCount = records.filter((r) => r.status === 'Gelmedi').length;
    const unmarkedCount = records.filter((r) => !r.status).length;
    const totalWage = records
      .filter((r) => r.status === 'Geldi' || r.status === 'Yarım Gün')
      .reduce((sum, r) => sum + Number(r.daily_wage || 0), 0);
    const paidAmount = records
      .filter((r) => r.status === 'Geldi' || r.status === 'Yarım Gün')
      .reduce((sum, r) => sum + Number(r.paid_amount || 0), 0);
    const unpaidAmount = totalWage - paidAmount;

    return NextResponse.json({
      date,
      summary: {
        totalEmployees,
        presentCount,
        halfDayCount,
        absentCount,
        unmarkedCount,
        totalWage,
        paidAmount,
        unpaidAmount,
      },
      records,
    });
  } catch (error) {
    console.error('Attendance GET error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

// POST: Save attendance & payment records for a date
export async function POST(request: NextRequest) {
  try {
    await initializeDatabase();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const db = getDb();
    const body = await request.json();
    const { date, records: itemsToProcess } = body as {
      date: string;
      records: Array<{
        employee_id: number;
        status?: 'Geldi' | 'Yarım Gün' | 'Gelmedi';
        daily_wage?: number;
        is_paid?: boolean | number;
        paid_amount?: number;
        account_id?: number | null;
        note?: string | null;
      }>;
    };

    if (!date || !itemsToProcess || !Array.isArray(itemsToProcess)) {
      return NextResponse.json({ error: 'Geçersiz veri gönderildi.' }, { status: 400 });
    }

    // Ensure category 'Maaş' exists
    const salaryCatRs = await db.execute("SELECT id FROM categories WHERE name = 'Maaş' AND type = 'Gider'");
    let salaryCategoryId = Number(salaryCatRs.rows[0]?.id || 0);

    if (!salaryCategoryId) {
      const res = await db.execute("INSERT INTO categories (name, type) VALUES ('Maaş', 'Gider')");
      salaryCategoryId = Number(res.lastInsertRowid);
    }

    const updatedAccountIds = new Set<number>();

    for (const item of itemsToProcess) {
      const empRs = await db.execute({
        sql: 'SELECT id, first_name, last_name, daily_wage FROM employees WHERE id = ?',
        args: [item.employee_id],
      });
      const emp = empRs.rows[0] as unknown as
        | { id: number; first_name: string; last_name: string; daily_wage: number }
        | undefined;

      if (!emp) continue;

      const defaultWage = Number(emp.daily_wage);
      const status = item.status === 'Gelmedi' ? 'Gelmedi' : item.status === 'Yarım Gün' ? 'Yarım Gün' : 'Geldi';

      // If status is Yarım Gün, default daily wage is half of normal daily wage unless custom wage specified
      let effectiveWage =
        item.daily_wage !== undefined && item.daily_wage !== null
          ? Math.max(0, parseFloat(String(item.daily_wage)))
          : status === 'Yarım Gün'
          ? defaultWage / 2
          : defaultWage;

      // Calculate paid_amount & is_paid
      let paidAmount = 0;
      let isPaid = 0;

      if (status === 'Geldi' || status === 'Yarım Gün') {
        if (item.paid_amount !== undefined && item.paid_amount !== null) {
          paidAmount = Math.max(0, parseFloat(String(item.paid_amount)) || 0);
          isPaid = paidAmount >= effectiveWage && effectiveWage > 0 ? 1 : paidAmount > 0 ? 1 : 0;
        } else if (item.is_paid) {
          paidAmount = effectiveWage;
          isPaid = 1;
        }
      }

      const targetAccountId = paidAmount > 0 && item.account_id ? Number(item.account_id) : null;
      const note = item.note?.trim() || null;

      // Check previous attendance record
      const existingAttRs = await db.execute({
        sql: 'SELECT * FROM attendances WHERE employee_id = ? AND date = ?',
        args: [item.employee_id, date],
      });
      const existingAttendance = existingAttRs.rows[0] as unknown as
        | {
            id: number;
            status: string;
            daily_wage: number;
            is_paid: number;
            paid_amount?: number;
            account_id: number | null;
            transaction_id: number | null;
          }
        | undefined;

      let transactionId = existingAttendance?.transaction_id || null;

      // Transaction handling
      if (existingAttendance?.transaction_id) {
        const prevTxRs = await db.execute({
          sql: 'SELECT id, account_id, amount FROM transactions WHERE id = ?',
          args: [existingAttendance.transaction_id],
        });
        const prevTx = prevTxRs.rows[0] as unknown as
          | { id: number; account_id: number; amount: number }
          | undefined;

        if (prevTx) {
          // If now unpaid, absent, or account/amount changed, refund previous account balance and delete transaction
          const needDelete =
            paidAmount <= 0 ||
            status === 'Gelmedi' ||
            targetAccountId !== prevTx.account_id ||
            paidAmount !== Number(prevTx.amount);

          if (needDelete) {
            // 1. Unlink transaction_id in attendances first to satisfy foreign key constraint
            await db.execute({
              sql: 'UPDATE attendances SET transaction_id = NULL WHERE id = ?',
              args: [existingAttendance.id],
            });

            // 2. Refund account balance
            await db.execute({
              sql: 'UPDATE accounts SET balance = balance + ? WHERE id = ?',
              args: [Number(prevTx.amount), prevTx.account_id],
            });
            updatedAccountIds.add(prevTx.account_id);

            // 3. Delete transaction
            await db.execute({
              sql: 'DELETE FROM transactions WHERE id = ?',
              args: [prevTx.id],
            });
            transactionId = null;
          }
        } else {
          transactionId = null;
        }
      }

      // If active attendance (Geldi or Yarım Gün) + has paidAmount > 0 + with a chosen account and no active transaction
      if ((status === 'Geldi' || status === 'Yarım Gün') && paidAmount > 0 && targetAccountId && !transactionId) {
        // Verify account exists
        const accRs = await db.execute({
          sql: 'SELECT id FROM accounts WHERE id = ?',
          args: [targetAccountId],
        });
        if (accRs.rows.length > 0) {
          const isPartial = paidAmount < effectiveWage;
          const statusLabel = status === 'Yarım Gün' ? ' (Yarım Gün)' : '';
          const txDesc = `Maaş / Yevmiye${statusLabel} (${isPartial ? `Kısmi: ₺${paidAmount}` : 'Tam Ödeme'}): ${emp.first_name} ${emp.last_name} (${date})`;
          const txResult = await db.execute({
            sql: `INSERT INTO transactions (type, category_id, account_id, currency, amount, transaction_date, description, created_by_user_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              'Gider',
              salaryCategoryId,
              targetAccountId,
              'TRY',
              paidAmount,
              date,
              txDesc,
              session.userId,
            ],
          });

          transactionId = Number(txResult.lastInsertRowid);

          // Deduct from account balance
          await db.execute({
            sql: 'UPDATE accounts SET balance = balance - ? WHERE id = ?',
            args: [paidAmount, targetAccountId],
          });
          updatedAccountIds.add(targetAccountId);
        }
      }

      // Upsert into attendances
      await db.execute({
        sql: `INSERT INTO attendances (employee_id, date, status, daily_wage, is_paid, paid_amount, account_id, transaction_id, note, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT(employee_id, date) DO UPDATE SET
                status = excluded.status,
                daily_wage = excluded.daily_wage,
                is_paid = excluded.is_paid,
                paid_amount = excluded.paid_amount,
                account_id = excluded.account_id,
                transaction_id = excluded.transaction_id,
                note = excluded.note,
                updated_at = datetime('now')`,
        args: [
          item.employee_id,
          date,
          status,
          effectiveWage,
          isPaid,
          paidAmount,
          targetAccountId,
          transactionId,
          note,
        ],
      });
    }

    // Broadcast updated accounts to real-time clients
    for (const accId of updatedAccountIds) {
      const updatedAcc = await db.execute({
        sql: 'SELECT id, name, balance FROM accounts WHERE id = ?',
        args: [accId],
      });
      if (updatedAcc.rows[0]) {
        sseManager.broadcast('account_updated', updatedAcc.rows[0]);
      }
    }

    return NextResponse.json({ success: true, message: 'Yoklama ve ödeme bilgileri güncellendi.' });
  } catch (error) {
    console.error('Attendance POST error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
