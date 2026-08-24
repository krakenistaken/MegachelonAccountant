// src/app/api/transactions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { verifySession } from '@/lib/auth';
import { sseManager } from '@/lib/sse';

// PUT: Update a transaction
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { type, category_id, account_id, currency, amount, transaction_date, description } = body;

    const db = getDb();

    // Get existing transaction
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(Number(id)) as {
      id: number;
      type: string;
      amount: number;
      account_id: number;
    } | undefined;

    if (!existing) {
      return NextResponse.json({ error: 'İşlem bulunamadı.' }, { status: 404 });
    }

    // Reverse old balance effect
    const oldBalanceChange = existing.type === 'Gelir' ? -existing.amount : existing.amount;
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(oldBalanceChange, existing.account_id);

    // Update transaction
    db.prepare(`
      UPDATE transactions 
      SET type = ?, category_id = ?, account_id = ?, currency = ?, amount = ?, 
          transaction_date = ?, description = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      type || existing.type,
      category_id,
      account_id,
      currency || 'TRY',
      Math.abs(amount),
      transaction_date,
      description || null,
      Number(id)
    );

    // Apply new balance effect
    const newType = type || existing.type;
    const newAmount = Math.abs(amount);
    const newAccountId = account_id || existing.account_id;
    const newBalanceChange = newType === 'Gelir' ? newAmount : -newAmount;
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(newBalanceChange, newAccountId);

    // Fetch updated transaction
    const updated = db
      .prepare(`
        SELECT 
          t.id, t.type, t.amount, t.currency, t.transaction_date, t.description,
          t.category_id, t.account_id, t.created_by_user_id, t.created_at, t.updated_at,
          c.name as category_name,
          a.name as account_name,
          u.username as created_by
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        LEFT JOIN users u ON t.created_by_user_id = u.id
        WHERE t.id = ?
      `)
      .get(Number(id));

    // Broadcast updates
    sseManager.broadcast('transaction_updated', updated);

    // Broadcast updated account balances (might be two accounts if changed)
    const updatedAccounts = db.prepare('SELECT id, name, balance FROM accounts WHERE id IN (?, ?)').all(existing.account_id, newAccountId);
    for (const acc of updatedAccounts) {
      sseManager.broadcast('account_updated', acc);
    }

    return NextResponse.json({ transaction: updated });
  } catch (error) {
    console.error('Transaction PUT error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

// DELETE: Delete a transaction
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const { id } = await params;
    const db = getDb();

    // Get existing transaction
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(Number(id)) as {
      id: number;
      type: string;
      amount: number;
      account_id: number;
    } | undefined;

    if (!existing) {
      return NextResponse.json({ error: 'İşlem bulunamadı.' }, { status: 404 });
    }

    // Reverse balance effect
    const balanceChange = existing.type === 'Gelir' ? -existing.amount : existing.amount;
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(balanceChange, existing.account_id);

    // Unlink any attendances referencing this transaction first to avoid foreign key errors
    db.prepare('UPDATE attendances SET transaction_id = NULL WHERE transaction_id = ?').run(Number(id));

    // Delete transaction
    db.prepare('DELETE FROM transactions WHERE id = ?').run(Number(id));

    // Broadcast deletion
    sseManager.broadcast('transaction_deleted', { id: Number(id) });

    // Broadcast updated account balance
    const updatedAccount = db.prepare('SELECT id, name, balance FROM accounts WHERE id = ?').get(existing.account_id);
    sseManager.broadcast('account_updated', updatedAccount);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Transaction DELETE error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
