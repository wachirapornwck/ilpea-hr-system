'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (
    employeeId: string,
    pin: string
  ) => Promise<{ mustChangePIN: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = 'ilpea_hr_session';

/** ตรวจสอบว่า stored object มี User shape ที่ถูกต้อง */
function isValidUser(obj: unknown): obj is User {
  if (!obj || typeof obj !== 'object') return false;
  const u = obj as Record<string, unknown>;
  return (
    typeof u.id === 'string' &&
    typeof u.employeeId === 'string' &&
    typeof u.firstName === 'string' &&
    typeof u.lastName === 'string' &&
    typeof u.role === 'string' &&
    typeof u.employeeType === 'string' &&
    typeof u.department === 'string'
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isValidUser(parsed)) {
          setUser(parsed);
        } else {
          // session shape เก่าหรือ invalid — clear ออก
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = async (
    employeeId: string,
    pin: string
  ): Promise<{ mustChangePIN: boolean }> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, pin }),
    });

    const data = await res.json();

    if (!res.ok) {
      // TEMPORARY (Phase 3 diagnosis): append the server's debug markers so
      // the failing step is visible on the login screen without DevTools.
      // Remove once the root cause is identified.
      const debug = data._debugStep
        ? ` [step=${data._debugStep} | ${data._debugError}: ${data._debugMessage}]`
        : '';
      throw new Error((data.message || 'เข้าสู่ระบบไม่สำเร็จ') + debug);
    }

    // เก็บเฉพาะ User object (session spec) — ไม่เก็บ mustChangePIN
    localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
    setUser(data.user);

    return { mustChangePIN: data.mustChangePIN ?? false };
  };

  const signOut = async () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
