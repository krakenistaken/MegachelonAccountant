// src/app/api/currencies/route.ts
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

// GET: List all currencies
export async function GET() {
  try {
    ensureInit();
    const db = getDb();
    const currencies = db.prepare('SELECT * FROM currencies ORDER BY code').all();
    return NextResponse.json({ currencies });
  } catch (error) {
    console.error('Currencies GET error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

// PUT: Update exchange rate
export async function PUT(request: NextRequest) {
  try {
    ensureInit();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const { id, exchange_rate } = await request.json();

    if (!id || exchange_rate === undefined) {
      return NextResponse.json({ error: 'ID ve döviz kuru zorunludur.' }, { status: 400 });
    }

    const db = getDb();
    db.prepare('UPDATE currencies SET exchange_rate = ? WHERE id = ?').run(exchange_rate, id);
    const updated = db.prepare('SELECT * FROM currencies WHERE id = ?').get(id);

    return NextResponse.json({ currency: updated });
  } catch (error) {
    console.error('Currencies PUT error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
