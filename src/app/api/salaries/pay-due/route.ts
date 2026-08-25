// src/app/api/salaries/pay-due/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { verifySession } from '@/lib/auth';
import { sseManager } from '@/lib/sse';

export async function POST(request: NextRequest) {
  try {
    await initializeDatabase();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const body = await request.json();
    const { employee_id, amount, account_id, date, note } = body;

    const empId = Number(employee_id);
    const payAmount = parseFloat(String(amount));
    const payDate = date || new Date().toISOString().split('T')[0];
    const targetAccountId = account_id ? Number(account_id) : null;

    if (!empId || isNaN(empId) || isNaN(payAmount) || payAmount <= 0) {
      return NextResponse.json(
        { error: 'Geçerli bir çalışan ve 0 dan büyük bir ödeme tutarı belirtilmelidir.' },
        { status: 400 }
      );
    }

    const db = getDb();

    // 1. Fetch employee
    const empRs = await db.execute({
      sql: 'SELECT id, first_name, last_name, daily_wage FROM employees WHERE id = ?',
      args: [empId],
    });
    const employee = empRs.rows[0] as unknown as
      | { id: number; first_name: string; last_name: string; daily_wage: number }
      | undefined;

    if (!employee) {
      return NextResponse.json({ error: 'Çalışan bulunamadı.' }, { status: 404 });
    }

    // 2. Fetch unpaid/partially paid attendances ordered by date ASC (en geçmiş borçtan başlayarak)
    const attendancesRs = await db.execute({
      sql: `SELECT 
              id, employee_id, date, status, daily_wage, is_paid,
              COALESCE(paid_amount, CASE WHEN is_paid = 1 THEN daily_wage ELSE 0 END) as paid_amount,
              account_id, transaction_id, note
            FROM attendances
            WHERE employee_id = ? AND status IN ('Geldi', 'Yarım Gün') AND (paid_amount < daily_wage OR is_paid = 0)
            ORDER BY date ASC`,
      args: [empId],
    });

    const unpaidDays = attendancesRs.rows as unknown as Array<{
      id: number;
      employee_id: number;
      date: string;
      status: string;
      daily_wage: number;
      is_paid: number;
      paid_amount: number;
      account_id: number | null;
      transaction_id: number | null;
      note: string | null;
    }>;

    if (unpaidDays.length === 0) {
      return NextResponse.json(
        { error: `${employee.first_name} ${employee.last_name} için ödenecek bekleyen borçlu gün bulunamadı.` },
        { status: 400 }
      );
    }

    // 3. Ensure 'Maaş' category exists
    const salaryCatRs = await db.execute("SELECT id FROM categories WHERE name = 'Maaş' AND type = 'Gider'");
    let salaryCategoryId = Number(salaryCatRs.rows[0]?.id || 0);
    if (!salaryCategoryId) {
      const res = await db.execute("INSERT INTO categories (name, type) VALUES ('Maaş', 'Gider')");
      salaryCategoryId = Number(res.lastInsertRowid);
    }

    // 4. Verify account if chosen
    if (targetAccountId) {
      const accCheck = await db.execute({
        sql: 'SELECT id, balance FROM accounts WHERE id = ?',
        args: [targetAccountId],
      });
      if (accCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Seçilen kasa bulunamadı.' }, { status: 400 });
      }
    }

    let remainingBudget = payAmount;
    let totalActuallyPaid = 0;
    const processedDays: Array<{ date: string; paidNow: number; totalPaidForDay: number; fullyPaid: boolean }> = [];

    // 5. Distribute payment chronologically
    for (const att of unpaidDays) {
      if (remainingBudget <= 0) break;

      const dailyWage = Number(att.daily_wage);
      const prevPaid = Number(att.paid_amount || 0);
      const dayDue = Math.max(0, dailyWage - prevPaid);

      if (dayDue <= 0) continue;

      const paymentForDay = Math.min(remainingBudget, dayDue);
      const newPaidAmount = prevPaid + paymentForDay;
      const isFullPaid = newPaidAmount >= dailyWage;
      const isPaidFlag = isFullPaid ? 1 : 1; // Since something was paid

      let txId = att.transaction_id;

      // If paying through an account, record transaction and update balance
      if (targetAccountId && paymentForDay > 0) {
        const txDesc = `Maaş / Borç Kapatma (${att.date} günü${att.status === 'Yarım Gün' ? ' - Yarım Gün' : ''}): ${employee.first_name} ${employee.last_name}${note ? ` - ${note}` : ''}`;
        const txRes = await db.execute({
          sql: `INSERT INTO transactions (type, category_id, account_id, currency, amount, transaction_date, description, created_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            'Gider',
            salaryCategoryId,
            targetAccountId,
            'TRY',
            paymentForDay,
            payDate,
            txDesc,
            session.userId,
          ],
        });
        txId = Number(txRes.lastInsertRowid);

        await db.execute({
          sql: 'UPDATE accounts SET balance = balance - ? WHERE id = ?',
          args: [paymentForDay, targetAccountId],
        });
      }

      // Update attendance record
      await db.execute({
        sql: `UPDATE attendances 
              SET paid_amount = ?, is_paid = ?, account_id = COALESCE(?, account_id), transaction_id = COALESCE(?, transaction_id), updated_at = datetime('now')
              WHERE id = ?`,
        args: [newPaidAmount, isPaidFlag, targetAccountId, txId, att.id],
      });

      remainingBudget -= paymentForDay;
      totalActuallyPaid += paymentForDay;

      processedDays.push({
        date: att.date,
        paidNow: paymentForDay,
        totalPaidForDay: newPaidAmount,
        fullyPaid: isFullPaid,
      });
    }

    // 6. Broadcast SSE for updated account balance
    if (targetAccountId) {
      const updatedAcc = await db.execute({
        sql: 'SELECT id, name, balance FROM accounts WHERE id = ?',
        args: [targetAccountId],
      });
      if (updatedAcc.rows[0]) {
        sseManager.broadcast('account_updated', updatedAcc.rows[0]);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${employee.first_name} ${employee.last_name} için ₺${totalActuallyPaid.toLocaleString('tr-TR')} tutarında borç ödemesi en eski günlerden başlanarak düşüldü.`,
      totalPaid: totalActuallyPaid,
      remainingUnusedBudget: remainingBudget,
      processedDaysCount: processedDays.length,
      processedDays,
    });
  } catch (error) {
    console.error('Pay due error:', error);
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}
