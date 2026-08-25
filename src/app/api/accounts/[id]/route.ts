// src/app/api/accounts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { verifySession } from '@/lib/auth';
import { sseManager } from '@/lib/sse';

// PUT: Rename / update account
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDatabase();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const { id } = await params;
    const accountId = Number(id);
    if (isNaN(accountId)) {
      return NextResponse.json({ error: 'Geçersiz kasa ID.' }, { status: 400 });
    }

    const { name } = await request.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Kasa adı zorunludur.' }, { status: 400 });
    }

    const db = getDb();

    // Check existing
    const existingRs = await db.execute({
      sql: 'SELECT * FROM accounts WHERE id = ?',
      args: [accountId],
    });
    if (existingRs.rows.length === 0) {
      return NextResponse.json({ error: 'Kasa bulunamadı.' }, { status: 404 });
    }

    // Check duplicate name
    const duplicateRs = await db.execute({
      sql: 'SELECT id FROM accounts WHERE name = ? AND id != ?',
      args: [name.trim(), accountId],
    });
    if (duplicateRs.rows.length > 0) {
      return NextResponse.json({ error: 'Bu isimde başka bir kasa zaten mevcut.' }, { status: 409 });
    }

    await db.execute({
      sql: 'UPDATE accounts SET name = ? WHERE id = ?',
      args: [name.trim(), accountId],
    });

    const updatedRs = await db.execute({
      sql: 'SELECT * FROM accounts WHERE id = ?',
      args: [accountId],
    });
    const updatedAccount = updatedRs.rows[0];

    sseManager.broadcast('account_updated', updatedAccount);

    return NextResponse.json({ account: updatedAccount });
  } catch (error) {
    console.error('Account PUT error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

// DELETE: Delete account
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDatabase();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const { id } = await params;
    const accountId = Number(id);
    if (isNaN(accountId)) {
      return NextResponse.json({ error: 'Geçersiz kasa ID.' }, { status: 400 });
    }

    const db = getDb();

    // Check existing
    const existingRs = await db.execute({
      sql: 'SELECT * FROM accounts WHERE id = ?',
      args: [accountId],
    });
    if (existingRs.rows.length === 0) {
      return NextResponse.json({ error: 'Kasa bulunamadı.' }, { status: 404 });
    }

    // Check if there are transactions attached to this account
    const txCountRs = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM transactions WHERE account_id = ?',
      args: [accountId],
    });
    const txCount = Number(txCountRs.rows[0]?.count || 0);

    if (txCount > 0) {
      return NextResponse.json(
        {
          error: `Bu kasaya bağlı ${txCount} adet işlem hareketi bulunmaktadır. Kasayı silebilmek için önce bu işlemleri silmeli veya başka bir kasaya taşımalısınız.`,
        },
        { status: 400 }
      );
    }

    // Unlink any attendances that might have this account_id
    await db.execute({
      sql: 'UPDATE attendances SET account_id = NULL WHERE account_id = ?',
      args: [accountId],
    });

    // Delete account
    await db.execute({
      sql: 'DELETE FROM accounts WHERE id = ?',
      args: [accountId],
    });

    sseManager.broadcast('account_deleted', { id: accountId });

    return NextResponse.json({ success: true, message: 'Kasa başarıyla silindi.' });
  } catch (error) {
    console.error('Account DELETE error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
