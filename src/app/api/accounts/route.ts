// src/app/api/accounts/route.ts
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

// GET: List all accounts
export async function GET() {
  try {
    ensureInit();
    const db = getDb();
    const accounts = db.prepare('SELECT * FROM accounts ORDER BY name').all();
    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('Accounts GET error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

// POST: Create a new account
export async function POST(request: NextRequest) {
  try {
    ensureInit();
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
    const existing = db.prepare('SELECT id FROM accounts WHERE name = ?').get(name);
    if (existing) {
      return NextResponse.json({ error: 'Bu isimde bir kasa zaten var.' }, { status: 409 });
    }

    const result = db.prepare('INSERT INTO accounts (name, balance) VALUES (?, 0)').run(name);
    const newAccount = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);

    sseManager.broadcast('account_created', newAccount);

    return NextResponse.json({ account: newAccount }, { status: 201 });
  } catch (error) {
    console.error('Accounts POST error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
