// src/app/api/transactions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { verifySession } from '@/lib/auth';
import { sseManager } from '@/lib/sse';

// PUT: Update a transaction
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
    const txId = Number(id);
    if (isNaN(txId)) {
      return NextResponse.json({ error: 'Geçersiz işlem ID.' }, { status: 400 });
    }

    const body = await request.json();
    const { type, category_id, account_id, currency, amount, transaction_date, description } = body;

    const db = getDb();

    // Get existing transaction
    const existingRs = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [txId],
    });
    const existing = existingRs.rows[0] as unknown as
      | {
          id: number;
          type: string;
          amount: number;
          account_id: number;
        }
      | undefined;

    if (!existing) {
      return NextResponse.json({ error: 'İşlem bulunamadı.' }, { status: 404 });
    }

    // Reverse old balance effect
    const oldBalanceChange = existing.type === 'Gelir' ? -Number(existing.amount) : Number(existing.amount);
    await db.execute({
      sql: 'UPDATE accounts SET balance = balance + ? WHERE id = ?',
      args: [oldBalanceChange, existing.account_id],
    });

    // Update transaction
    await db.execute({
      sql: `
        UPDATE transactions 
        SET type = ?, category_id = ?, account_id = ?, currency = ?, amount = ?, 
            transaction_date = ?, description = ?, updated_at = datetime('now')
        WHERE id = ?
      `,
      args: [
        type || existing.type,
        category_id,
        account_id,
        currency || 'TRY',
        Math.abs(amount),
        transaction_date,
        description || null,
        txId,
      ],
    });

    // Apply new balance effect
    const newType = type || existing.type;
    const newAmount = Math.abs(amount);
    const newAccountId = account_id || existing.account_id;
    const newBalanceChange = newType === 'Gelir' ? newAmount : -newAmount;
    await db.execute({
      sql: 'UPDATE accounts SET balance = balance + ? WHERE id = ?',
      args: [newBalanceChange, newAccountId],
    });

    // Fetch updated transaction
    const updatedRs = await db.execute({
      sql: `
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
      `,
      args: [txId],
    });
    const updated = updatedRs.rows[0];

    // Broadcast updates
    sseManager.broadcast('transaction_updated', updated);

    // Broadcast updated account balances (might be two accounts if changed)
    const updatedAccounts = await db.execute({
      sql: 'SELECT id, name, balance FROM accounts WHERE id IN (?, ?)',
      args: [existing.account_id, newAccountId],
    });
    for (const acc of updatedAccounts.rows) {
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
    await initializeDatabase();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const { id } = await params;
    const txId = Number(id);
    if (isNaN(txId)) {
      return NextResponse.json({ error: 'Geçersiz işlem ID.' }, { status: 400 });
    }

    const db = getDb();

    // Get existing transaction
    const existingRs = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [txId],
    });
    const existing = existingRs.rows[0] as unknown as
      | {
          id: number;
          type: string;
          amount: number;
          account_id: number;
        }
      | undefined;

    if (!existing) {
      return NextResponse.json({ error: 'İşlem bulunamadı.' }, { status: 404 });
    }

    // Reverse balance effect
    const balanceChange = existing.type === 'Gelir' ? -Number(existing.amount) : Number(existing.amount);
    await db.execute({
      sql: 'UPDATE accounts SET balance = balance + ? WHERE id = ?',
      args: [balanceChange, existing.account_id],
    });

    // Unlink any attendances referencing this transaction first to avoid foreign key errors
    await db.execute({
      sql: 'UPDATE attendances SET transaction_id = NULL WHERE transaction_id = ?',
      args: [txId],
    });

    // Delete transaction
    await db.execute({
      sql: 'DELETE FROM transactions WHERE id = ?',
      args: [txId],
    });

    // Broadcast deletion
    sseManager.broadcast('transaction_deleted', { id: txId });

    // Broadcast updated account balance
    const updatedAccount = await db.execute({
      sql: 'SELECT id, name, balance FROM accounts WHERE id = ?',
      args: [existing.account_id],
    });
    sseManager.broadcast('account_updated', updatedAccount.rows[0]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Transaction DELETE error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
