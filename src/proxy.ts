import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ============================================
// Rate Limiting (in-memory, per-IP sliding window)
// For production at scale, replace with Redis (e.g., @upstash/ratelimit)
// ============================================

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const MAX_REQUESTS_CHAT = 20;
const MAX_REQUESTS_PLAYER = 30;

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

function isRateLimited(key: string, maxRequests: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }

  entry.count++;
  return entry.count > maxRequests;
}

// Periodic cleanup to prevent memory leak (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 300_000);

// ============================================
// Unified Middleware
// 1. Refresh Supabase auth session (all routes)
// 2. Rate-limit API routes
// ============================================

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Step 1: Supabase Auth Session Refresh ──
  // Creates a response we'll return (or pass to rate limiter).
  // Ensures cookies stay fresh so getUser() works in server components.

  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    // Refresh session — this is what keeps the auth token alive
    await supabase.auth.getUser();
  }

  // ── Step 2: Rate Limiting (API routes only) ──

  if (pathname.startsWith('/api/')) {
    const ip = getClientIP(request);

    if (pathname.startsWith('/api/chat')) {
      if (isRateLimited(`chat:${ip}`, MAX_REQUESTS_CHAT)) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait a moment before sending another message.' },
          { status: 429 }
        );
      }
    }

    if (pathname.startsWith('/api/player')) {
      if (isRateLimited(`player:${ip}`, MAX_REQUESTS_PLAYER)) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait before looking up another player.' },
          { status: 429 }
        );
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all routes except static assets:
     * - _next/static, _next/image
     * - favicon.ico
     * - image files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
