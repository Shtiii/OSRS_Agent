import { NextResponse } from 'next/server';
import { getPlayerStats, updatePlayerStats, getPlayerGains } from '@/lib/osrs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json(
      { error: 'Username is required' },
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
  const { username } = await req.json();

  if (!username) {
    return NextResponse.json(
      { error: 'Username is required' },
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
