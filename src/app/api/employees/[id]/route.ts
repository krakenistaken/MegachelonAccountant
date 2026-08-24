// src/app/api/employees/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { verifySession } from '@/lib/auth';

let initialized = false;
function ensureInit() {
  if (!initialized) {
    initializeDatabase();
    initialized = true;
  }
}

// PUT: Update employee
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    ensureInit();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const { id } = await params;
    const empId = parseInt(id, 10);
    if (isNaN(empId)) {
      return NextResponse.json({ error: 'Geçersiz çalışan ID.' }, { status: 400 });
    }

    const body = await request.json();
    const { first_name, last_name, daily_wage, phone, is_active } = body;

    const db = getDb();
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
    if (!existing) {
      return NextResponse.json({ error: 'Çalışan bulunamadı.' }, { status: 404 });
    }

    const updatedFirstName = first_name !== undefined ? first_name.trim() : (existing as { first_name: string }).first_name;
    const updatedLastName = last_name !== undefined ? last_name.trim() : (existing as { last_name: string }).last_name;
    const updatedWage = daily_wage !== undefined ? parseFloat(daily_wage) : (existing as { daily_wage: number }).daily_wage;
    const updatedPhone = phone !== undefined ? phone?.trim() || null : (existing as { phone: string | null }).phone;
    const updatedActive = is_active !== undefined ? (is_active ? 1 : 0) : (existing as { is_active: number }).is_active;

    db.prepare(
      `UPDATE employees 
       SET first_name = ?, last_name = ?, daily_wage = ?, phone = ?, is_active = ?
       WHERE id = ?`
    ).run(updatedFirstName, updatedLastName, updatedWage, updatedPhone, updatedActive, empId);

    const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
    return NextResponse.json({ employee: updated });
  } catch (error) {
    console.error('Employee PUT error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

// DELETE: Delete employee
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    ensureInit();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const { id } = await params;
    const empId = parseInt(id, 10);
    if (isNaN(empId)) {
      return NextResponse.json({ error: 'Geçersiz çalışan ID.' }, { status: 400 });
    }

    const db = getDb();
    db.prepare('DELETE FROM employees WHERE id = ?').run(empId);

    return NextResponse.json({ message: 'Çalışan silindi.' });
  } catch (error) {
    console.error('Employee DELETE error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
