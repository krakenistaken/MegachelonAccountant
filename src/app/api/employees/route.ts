// src/app/api/employees/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { verifySession } from '@/lib/auth';

// GET: List all employees with their total stats
export async function GET() {
  try {
    await initializeDatabase();
    const db = getDb();

    const employeesRs = await db.execute(`
      SELECT 
        e.id, e.first_name, e.last_name, e.daily_wage, e.phone, e.is_active, e.created_at,
        COALESCE(SUM(CASE WHEN a.status = 'Geldi' THEN 1 WHEN a.status = 'Yarım Gün' THEN 0.5 ELSE 0 END), 0) as total_days_worked,
        COALESCE(SUM(CASE WHEN a.status IN ('Geldi', 'Yarım Gün') THEN a.daily_wage ELSE 0 END), 0) as total_earned,
        COALESCE(SUM(CASE WHEN a.status IN ('Geldi', 'Yarım Gün') THEN (CASE WHEN a.paid_amount > 0 THEN a.paid_amount WHEN a.is_paid = 1 THEN a.daily_wage ELSE 0 END) ELSE 0 END), 0) as total_paid
      FROM employees e
      LEFT JOIN attendances a ON e.id = a.employee_id
      GROUP BY e.id
      ORDER BY e.is_active DESC, e.first_name ASC
    `);

    const employees = (employeesRs.rows as unknown as Array<{
      id: number;
      first_name: string;
      last_name: string;
      daily_wage: number;
      phone: string | null;
      is_active: number;
      created_at: string;
      total_days_worked: number;
      total_earned: number;
      total_paid: number;
    }>).map((emp) => ({
      ...emp,
      total_days_worked: Number(emp.total_days_worked),
      total_earned: Number(emp.total_earned),
      total_paid: Number(emp.total_paid),
      balance_due: Number(emp.total_earned) - Number(emp.total_paid),
    }));

    return NextResponse.json({ employees });
  } catch (error) {
    console.error('Employees GET error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

// POST: Add new employee
export async function POST(request: NextRequest) {
  try {
    await initializeDatabase();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const body = await request.json();
    const { first_name, last_name, daily_wage, phone } = body;

    if (!first_name || !last_name) {
      return NextResponse.json(
        { error: 'İsim ve soyisim alanları zorunludur.' },
        { status: 400 }
      );
    }

    const wage = parseFloat(daily_wage) || 0;
    if (wage < 0) {
      return NextResponse.json(
        { error: 'Günlük yevmiye 0 veya daha büyük olmalıdır.' },
        { status: 400 }
      );
    }

    const db = getDb();
    const result = await db.execute({
      sql: `INSERT INTO employees (first_name, last_name, daily_wage, phone) VALUES (?, ?, ?, ?)`,
      args: [first_name.trim(), last_name.trim(), wage, phone?.trim() || null],
    });

    const newEmpRs = await db.execute({
      sql: 'SELECT * FROM employees WHERE id = ?',
      args: [Number(result.lastInsertRowid)],
    });

    return NextResponse.json({ employee: newEmpRs.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Employees POST error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
