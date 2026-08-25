// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import getDb from '@/lib/db';
import { initializeDatabase } from '@/lib/db/schema';
import { createSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    await initializeDatabase();

    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Kullanıcı adı ve parola gereklidir.' },
        { status: 400 }
      );
    }

    const db = getDb();
    const userRs = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [username],
    });

    const user = userRs.rows[0] as unknown as
      | {
          id: number;
          username: string;
          password_hash: string;
          role: string;
        }
      | undefined;

    if (!user) {
      return NextResponse.json(
        { error: 'Kullanıcı adı veya parola hatalı.' },
        { status: 401 }
      );
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return NextResponse.json(
        { error: 'Kullanıcı adı veya parola hatalı.' },
        { status: 401 }
      );
    }

    await createSession({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}
