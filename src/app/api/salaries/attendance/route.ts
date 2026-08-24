// src/app/api/salaries/attendance/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { verifySession } from '@/lib/auth';
import { sseManager } from '@/lib/sse';

let initialized = false;
function ensureInit() {
  if (!initialized) {
    initializeDatabase();
    initialized = true;
  }
}

// GET: Fetch attendance records for a specific date or for an employee's monthly calendar
export async function GET(request: NextRequest) {
  try {
    ensureInit();
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

      const records = db
        .prepare(
          `SELECT 
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
          ORDER BY a.date ASC`
        )
        .all(empId, startDate, endDate);

      const employee = db
        .prepare('SELECT id, first_name, last_name, daily_wage, phone, is_active FROM employees WHERE id = ?')
        .get(empId);

      return NextResponse.json({
        employee,
        month,
        startDate,
        endDate,
        records,
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

    const records = db.prepare(query).all(date) as Array<{
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
    const absentCount = records.filter((r) => r.status === 'Gelmedi').length;
    const unmarkedCount = records.filter((r) => !r.status).length;
    const totalWage = records
      .filter((r) => r.status === 'Geldi')
      .reduce((sum, r) => sum + r.daily_wage, 0);
    const paidAmount = records
      .filter((r) => r.status === 'Geldi')
      .reduce((sum, r) => sum + (r.paid_amount || 0), 0);
    const unpaidAmount = totalWage - paidAmount;

    return NextResponse.json({
      date,
      summary: {
        totalEmployees,
        presentCount,
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
    ensureInit();
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
        status?: 'Geldi' | 'Gelmedi';
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
    let salaryCategory = db
      .prepare("SELECT id FROM categories WHERE name = 'Maaş' AND type = 'Gider'")
      .get() as { id: number } | undefined;

    if (!salaryCategory) {
      const res = db.prepare("INSERT INTO categories (name, type) VALUES ('Maaş', 'Gider')").run();
      salaryCategory = { id: Number(res.lastInsertRowid) };
    }

    const updatedAccountIds = new Set<number>();

    // Execute in transaction
    const saveTransaction = db.transaction(() => {
      for (const item of itemsToProcess) {
        const emp = db
          .prepare('SELECT id, first_name, last_name, daily_wage FROM employees WHERE id = ?')
          .get(item.employee_id) as
          | { id: number; first_name: string; last_name: string; daily_wage: number }
          | undefined;

        if (!emp) continue;

        const effectiveWage =
          item.daily_wage !== undefined && item.daily_wage !== null
            ? Math.max(0, parseFloat(String(item.daily_wage)))
            : emp.daily_wage;

        const status = item.status === 'Gelmedi' ? 'Gelmedi' : 'Geldi';

        // Calculate paid_amount & is_paid
        let paidAmount = 0;
        let isPaid = 0;

        if (status === 'Geldi') {
          if (item.paid_amount !== undefined && item.paid_amount !== null) {
            paidAmount = Math.max(0, parseFloat(String(item.paid_amount)) || 0);
            isPaid = paidAmount > 0 ? 1 : 0;
          } else if (item.is_paid) {
            paidAmount = effectiveWage;
            isPaid = 1;
          }
        }

        const targetAccountId = paidAmount > 0 && item.account_id ? Number(item.account_id) : null;
        const note = item.note?.trim() || null;

        // Check previous attendance record
        const existingAttendance = db
          .prepare('SELECT * FROM attendances WHERE employee_id = ? AND date = ?')
          .get(item.employee_id, date) as
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
          const prevTx = db
            .prepare('SELECT id, account_id, amount FROM transactions WHERE id = ?')
            .get(existingAttendance.transaction_id) as
            | { id: number; account_id: number; amount: number }
            | undefined;

          if (prevTx) {
            // If now unpaid, absent, or account/amount changed, refund previous account balance and delete transaction
            const needDelete =
              paidAmount <= 0 ||
              status === 'Gelmedi' ||
              targetAccountId !== prevTx.account_id ||
              paidAmount !== prevTx.amount;

            if (needDelete) {
              // 1. Unlink transaction_id in attendances first to satisfy foreign key constraint
              db.prepare('UPDATE attendances SET transaction_id = NULL WHERE id = ?').run(
                existingAttendance.id
              );

              // 2. Refund account balance
              db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(
                prevTx.amount,
                prevTx.account_id
              );
              updatedAccountIds.add(prevTx.account_id);

              // 3. Delete transaction
              db.prepare('DELETE FROM transactions WHERE id = ?').run(prevTx.id);
              transactionId = null;
            }
          } else {
            transactionId = null;
          }
        }

        // If currently Geldi + has paidAmount > 0 + with a chosen account and no active transaction
        if (status === 'Geldi' && paidAmount > 0 && targetAccountId && !transactionId) {
          // Verify account exists
          const acc = db.prepare('SELECT id FROM accounts WHERE id = ?').get(targetAccountId);
          if (acc) {
            const isPartial = paidAmount < effectiveWage;
            const txDesc = `Maaş / Yevmiye (${isPartial ? `Kısmi: ₺${paidAmount}` : 'Tam Ödeme'}): ${emp.first_name} ${emp.last_name} (${date})`;
            const txResult = db
              .prepare(
                `INSERT INTO transactions (type, category_id, account_id, currency, amount, transaction_date, description, created_by_user_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .run(
                'Gider',
                salaryCategory!.id,
                targetAccountId,
                'TRY',
                paidAmount,
                date,
                txDesc,
                session.userId
              );

            transactionId = Number(txResult.lastInsertRowid);

            // Deduct from account balance
            db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(
              paidAmount,
              targetAccountId
            );
            updatedAccountIds.add(targetAccountId);
          }
        }

        // Upsert into attendances
        db.prepare(
          `INSERT INTO attendances (employee_id, date, status, daily_wage, is_paid, paid_amount, account_id, transaction_id, note, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(employee_id, date) DO UPDATE SET
             status = excluded.status,
             daily_wage = excluded.daily_wage,
             is_paid = excluded.is_paid,
             paid_amount = excluded.paid_amount,
             account_id = excluded.account_id,
             transaction_id = excluded.transaction_id,
             note = excluded.note,
             updated_at = datetime('now')`
        ).run(
          item.employee_id,
          date,
          status,
          effectiveWage,
          isPaid,
          paidAmount,
          targetAccountId,
          transactionId,
          note
        );
      }
    });

    saveTransaction();

    // Broadcast updated accounts to real-time clients
    for (const accId of updatedAccountIds) {
      const updatedAcc = db.prepare('SELECT id, name, balance FROM accounts WHERE id = ?').get(accId);
      if (updatedAcc) {
        sseManager.broadcast('account_updated', updatedAcc);
      }
    }

    return NextResponse.json({ success: true, message: 'Yoklama ve ödeme bilgileri güncellendi.' });
  } catch (error) {
    console.error('Attendance POST error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
