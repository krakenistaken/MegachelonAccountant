// src/app/api/categories/route.ts
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

// GET: List all categories
export async function GET() {
  try {
    ensureInit();
    const db = getDb();
    const categories = db.prepare('SELECT * FROM categories ORDER BY type, name').all();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Categories GET error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

// POST: Create a new category
export async function POST(request: NextRequest) {
  try {
    ensureInit();
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
    const result = db.prepare('INSERT INTO categories (name, type) VALUES (?, ?)').run(name, type);

    const newCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);

    return NextResponse.json({ category: newCategory }, { status: 201 });
  } catch (error) {
    console.error('Categories POST error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
