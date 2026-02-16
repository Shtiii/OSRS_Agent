import { NextResponse } from 'next/server';
import { getPlayerStats, updatePlayerStats, getPlayerGains } from '@/lib/osrs';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

// RSN: 1-12 characters, alphanumeric + spaces + hyphens + underscores
const RSN_REGEX = /^[a-zA-Z0-9 _-]{1,12}$/;

function validateUsername(username: string | null): string | null {
  if (!username) return null;
  const trimmed = username.trim();
  if (!RSN_REGEX.test(trimmed)) return null;
  return trimmed;
}

function rateLimitResponse(req: Request, prefix: string) {
  const clientId = getClientIdentifier(req);
  const check = checkRateLimit(`${prefix}:${clientId}`, {
    limit: 15,          // 15 lookups
    windowSeconds: 60,  // per minute
  });
  if (!check.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before making more requests.' },
      {
        status: 429,
        headers: { 'Retry-After': Math.ceil((check.resetAt - Date.now()) / 1000).toString() },
      }
    );
  }
  return null;
}

export async function GET(req: Request) {
  const limited = rateLimitResponse(req, 'player-get');
  if (limited) return limited;
  const { searchParams } = new URL(req.url);
  const username = validateUsername(searchParams.get('username'));

  if (!username) {
    return NextResponse.json(
      { error: 'Invalid or missing username. RSN must be 1-12 characters (letters, numbers, spaces, hyphens).' },
      { status: 400 }
    );
  }

  try {
    const [stats, gains] = await Promise.all([
      getPlayerStats(username),
      getPlayerGains(username, 'week'),
    ]);

    if (!stats) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ stats, gains });
  } catch (error) {
    console.error('Error fetching player data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch player data' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const limited = rateLimitResponse(req, 'player-post');
  if (limited) return limited;

  let body: { username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    );
  }

  const username = validateUsername(body.username ?? null);

  if (!username) {
    return NextResponse.json(
      { error: 'Invalid or missing username. RSN must be 1-12 characters (letters, numbers, spaces, hyphens).' },
      { status: 400 }
    );
  }

  try {
    const stats = await updatePlayerStats(username);

    if (!stats) {
      return NextResponse.json(
        { error: 'Failed to update player stats' },
        { status: 500 }
      );
    }

    const gains = await getPlayerGains(username, 'week');

    return NextResponse.json({ stats, gains });
  } catch (error) {
    console.error('Error updating player data:', error);
    return NextResponse.json(
      { error: 'Failed to update player data' },
      { status: 500 }
    );
  }
}
