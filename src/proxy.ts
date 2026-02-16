import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple in-memory rate limiter (per-IP, sliding window)
// For production at scale, replace with Redis-based (e.g., @upstash/ratelimit)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const MAX_REQUESTS_CHAT = 20; // 20 chat requests per minute
const MAX_REQUESTS_PLAYER = 30; // 30 player lookups per minute

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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only rate-limit API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const ip = getClientIP(request);

  if (pathname.startsWith('/api/chat')) {
    const key = `chat:${ip}`;
    if (isRateLimited(key, MAX_REQUESTS_CHAT)) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment before sending another message.' },
        { status: 429 }
      );
    }
  }

  if (pathname.startsWith('/api/player')) {
    const key = `player:${ip}`;
    if (isRateLimited(key, MAX_REQUESTS_PLAYER)) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before looking up another player.' },
        { status: 429 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
