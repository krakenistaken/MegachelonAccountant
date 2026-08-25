// src/app/api/categories/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { verifySession } from '@/lib/auth';

// GET: List all categories
export async function GET() {
  try {
    await initializeDatabase();
    const db = getDb();
    const rs = await db.execute('SELECT * FROM categories ORDER BY type, name');
    return NextResponse.json({ categories: rs.rows });
  } catch (error) {
    console.error('Categories GET error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

// POST: Create a new category
export async function POST(request: NextRequest) {
  try {
    await initializeDatabase();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const { name, type } = await request.json();

    if (!name || !type) {
      return NextResponse.json({ error: 'Ad ve tür alanları zorunludur.' }, { status: 400 });
    }

    if (!['Gelir', 'Gider'].includes(type)) {
      return NextResponse.json({ error: 'Tür "Gelir" veya "Gider" olmalıdır.' }, { status: 400 });
    }

    const db = getDb();
    const result = await db.execute({
      sql: 'INSERT INTO categories (name, type) VALUES (?, ?)',
      args: [name, type],
    });

    const newCatRs = await db.execute({
      sql: 'SELECT * FROM categories WHERE id = ?',
      args: [Number(result.lastInsertRowid)],
    });

    return NextResponse.json({ category: newCatRs.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Categories POST error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
