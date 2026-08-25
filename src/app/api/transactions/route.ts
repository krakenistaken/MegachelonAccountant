// src/app/api/transactions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { verifySession } from '@/lib/auth';
import { sseManager } from '@/lib/sse';
import type { InValue } from '@libsql/client';

// GET: List all transactions with optional filters
export async function GET(request: NextRequest) {
  try {
    await initializeDatabase();
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const type = searchParams.get('type');
    const categoryId = searchParams.get('category_id');
    const accountId = searchParams.get('account_id');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    let query = `
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
      WHERE 1=1
    `;
    const params: InValue[] = [];

    if (type) {
      query += ' AND t.type = ?';
      params.push(type);
    }
    if (categoryId) {
      query += ' AND t.category_id = ?';
      params.push(Number(categoryId));
    }
    if (accountId) {
      query += ' AND t.account_id = ?';
      params.push(Number(accountId));
    }
    if (dateFrom) {
      query += ' AND t.transaction_date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      query += ' AND t.transaction_date <= ?';
      params.push(dateTo);
    }

    query += ' ORDER BY t.transaction_date DESC, t.created_at DESC';

    const transactions = await db.execute({
      sql: query,
      args: params,
    });

    return NextResponse.json({ transactions: transactions.rows });
  } catch (error) {
    console.error('Transactions GET error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

// POST: Create a new transaction
export async function POST(request: NextRequest) {
  try {
    await initializeDatabase();
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const body = await request.json();
    const { type, category_id, account_id, currency, amount, transaction_date, description } = body;

    // Validation
    if (!type || !category_id || !account_id || !amount || !transaction_date) {
      return NextResponse.json(
        { error: 'Tür, kategori, kasa, tutar ve tarih alanları zorunludur.' },
        { status: 400 }
      );
    }

    if (!['Gelir', 'Gider'].includes(type)) {
      return NextResponse.json(
        { error: 'Tür "Gelir" veya "Gider" olmalıdır.' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Insert transaction
    const result = await db.execute({
      sql: `INSERT INTO transactions (type, category_id, account_id, currency, amount, transaction_date, description, created_by_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        type,
        category_id,
        account_id,
        currency || 'TRY',
        Math.abs(amount),
        transaction_date,
        description || null,
        session.userId,
      ],
    });

    // Update account balance
    const balanceChange = type === 'Gelir' ? Math.abs(amount) : -Math.abs(amount);
    await db.execute({
      sql: 'UPDATE accounts SET balance = balance + ? WHERE id = ?',
      args: [balanceChange, account_id],
    });

    // Fetch the created transaction with joins
    const newTxRs = await db.execute({
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
      args: [Number(result.lastInsertRowid)],
    });
    const newTransaction = newTxRs.rows[0];

    // Broadcast to all connected clients
    sseManager.broadcast('transaction_created', newTransaction);

    // Also broadcast updated account balance
    const updatedAccRs = await db.execute({
      sql: 'SELECT id, name, balance FROM accounts WHERE id = ?',
      args: [account_id],
    });
    sseManager.broadcast('account_updated', updatedAccRs.rows[0]);

    return NextResponse.json({ transaction: newTransaction }, { status: 201 });
  } catch (error) {
    console.error('Transactions POST error:', error);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
