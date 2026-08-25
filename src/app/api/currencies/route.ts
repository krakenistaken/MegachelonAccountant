// src/app/api/currencies/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { verifySession } from '@/lib/auth';

// GET: List all currencies
export async function GET() {
  try {
    await initializeDatabase();
    const db = getDb();
    const rs = await db.execute('SELECT * FROM currencies ORDER BY code');
    return NextResponse.json({ currencies: rs.rows });
  } catch (error) {
    console.error('Currencies GET error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

// PUT: Update exchange rate
export async function PUT(request: NextRequest) {
  try {
    await initializeDatabase();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const { id, exchange_rate } = await request.json();

    if (!id || exchange_rate === undefined) {
      return NextResponse.json({ error: 'ID ve döviz kuru zorunludur.' }, { status: 400 });
    }

    const db = getDb();
    await db.execute({
      sql: 'UPDATE currencies SET exchange_rate = ? WHERE id = ?',
      args: [exchange_rate, id],
    });

    const updated = await db.execute({
      sql: 'SELECT * FROM currencies WHERE id = ?',
      args: [id],
    });

    return NextResponse.json({ currency: updated.rows[0] });
  } catch (error) {
    console.error('Currencies PUT error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
