// src/app/api/accounts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { verifySession } from '@/lib/auth';
import { sseManager } from '@/lib/sse';

// GET: List all accounts
export async function GET() {
  try {
    await initializeDatabase();
    const db = getDb();
    const rs = await db.execute('SELECT * FROM accounts ORDER BY name');
    return NextResponse.json({ accounts: rs.rows });
  } catch (error) {
    console.error('Accounts GET error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

// POST: Create a new account
export async function POST(request: NextRequest) {
  try {
    await initializeDatabase();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const { name } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Kasa adı zorunludur.' }, { status: 400 });
    }

    const db = getDb();

    // Check for duplicate name
    const existing = await db.execute({
      sql: 'SELECT id FROM accounts WHERE name = ?',
      args: [name],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'Bu isimde bir kasa zaten var.' }, { status: 409 });
    }

    const result = await db.execute({
      sql: 'INSERT INTO accounts (name, balance) VALUES (?, 0)',
      args: [name],
    });

    const newAccRs = await db.execute({
      sql: 'SELECT * FROM accounts WHERE id = ?',
      args: [Number(result.lastInsertRowid)],
    });
    const newAccount = newAccRs.rows[0];

    sseManager.broadcast('account_created', newAccount);

    return NextResponse.json({ account: newAccount }, { status: 201 });
  } catch (error) {
    console.error('Accounts POST error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
