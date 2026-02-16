import { getSupabaseClient } from '@/lib/supabase';
import { createEmbedding } from '@/lib/rag';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { z } from 'zod';

const feedbackSchema = z.object({
  messageId: z.string().min(1),
  chatId: z.string().nullable().optional(),
  rating: z.number().refine((v) => v === -1 || v === 1, 'Rating must be -1 or 1'),
  correction: z.string().max(2000).optional(),
  userMessage: z.string().max(10000).optional(),
  assistantMessage: z.string().max(10000).optional(),
  category: z.string().max(100).optional(),
  topic: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  // Rate limit feedback submissions
  const clientId = getClientIdentifier(req);
  const rateCheck = checkRateLimit(`feedback:${clientId}`, {
    limit: 20,
    windowSeconds: 60,
  });

  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many feedback submissions. Please wait.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const parseResult = feedbackSchema.safeParse(body);

    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid feedback data', details: parseResult.error.flatten() }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { messageId, chatId, rating, correction, userMessage, assistantMessage, category, topic } = parseResult.data;

    const supabase = getSupabaseClient();
    if (!supabase) {
      // Store feedback locally if no Supabase — just acknowledge
      return new Response(
        JSON.stringify({ success: true, stored: false, message: 'Feedback noted (no database configured)' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Insert feedback record
    const { data: feedbackRow, error: feedbackError } = await (supabase as any)
      .from('feedback')
      .insert({
        message_id: messageId,
        chat_id: chatId || null,
        rating,
        correction: correction || null,
        user_message: userMessage || null,
        assistant_message: assistantMessage || null,
      })
      .select('id')
      .single();

    if (feedbackError) {
      console.error('Error saving feedback:', feedbackError);
      return new Response(
        JSON.stringify({ error: 'Failed to save feedback' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // If there's a correction with a dislike, create an expert tip
    let expertTipCreated = false;
    if (rating === -1 && correction && correction.trim().length > 10) {
      try {
        // Build the tip content combining context
        const tipContent = buildExpertTipContent(userMessage, assistantMessage, correction);
        
        // Create embedding for the tip
        const embedding = await createEmbedding(tipContent);

        if (embedding) {
          const { error: tipError } = await (supabase as any)
            .from('expert_tips')
            .insert({
              content: tipContent,
              category: category || inferCategory(userMessage || '', correction),
              topic: topic || inferTopic(userMessage || '', correction),
              source_feedback_id: feedbackRow?.id || null,
              status: 'approved', // Auto-approve for now; can add moderation later
              embedding,
            });

          if (!tipError) {
            expertTipCreated = true;
          } else {
            console.error('Error creating expert tip:', tipError);
          }
        }
      } catch (tipErr) {
        console.error('Error processing expert tip:', tipErr);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        stored: true, 
        feedbackId: feedbackRow?.id,
        expertTipCreated,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Feedback API error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process feedback' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================
// Helper Functions
// ============================================

function buildExpertTipContent(
  userMessage?: string,
  assistantMessage?: string,
  correction?: string
): string {
  const parts: string[] = [];

  if (userMessage) {
    parts.push(`Question: ${userMessage.slice(0, 500)}`);
  }
  if (assistantMessage) {
    parts.push(`Original answer (incorrect/incomplete): ${assistantMessage.slice(0, 500)}`);
  }
  if (correction) {
    parts.push(`Expert correction: ${correction}`);
  }

  return parts.join('\n\n');
}

function inferCategory(question: string, correction: string): string {
  const text = `${question} ${correction}`.toLowerCase();

  const categories: [string, string[]][] = [
    ['boss', ['boss', 'zulrah', 'vorkath', 'cox', 'tob', 'toa', 'gauntlet', 'inferno', 'cerberus', 'godwars', 'gwd', 'nightmare', 'nex', 'raids', 'kill', 'kc']],
    ['quest', ['quest', 'recipe for disaster', 'dragon slayer', 'monkey madness', 'desert treasure', 'song of the elves', 'quest point', 'qpc']],
    ['skilling', ['xp', 'training', 'level', 'runecrafting', 'mining', 'woodcutting', 'fishing', 'cooking', 'farming', 'herblore', 'crafting', 'smithing', 'fletching', 'agility', 'thieving', 'hunter', 'construction', 'firemaking', 'sailing']],
    ['money_making', ['money', 'gp', 'profit', 'gold', 'merch', 'flip', 'income']],
    ['gear', ['gear', 'equipment', 'bis', 'best in slot', 'weapon', 'armour', 'armor', 'setup', 'loadout']],
    ['pvp', ['pk', 'pvp', 'wilderness', 'pking', 'bridding', 'nh']],
  ];

  for (const [cat, keywords] of categories) {
    if (keywords.some((kw) => text.includes(kw))) {
      return cat;
    }
  }

  return 'general';
}

function inferTopic(question: string, correction: string): string {
  const text = `${question} ${correction}`;

  // Try to extract a specific topic (boss name, skill name, quest name, etc.)
  const topicPatterns = [
    // Boss names
    /\b(zulrah|vorkath|gauntlet|corrupted gauntlet|cerberus|inferno|fight caves|jad|corporeal beast|nightmare|nex|chambers of xeric|cox|theatre of blood|tob|tombs of amascut|toa|kalphite queen|kq|giant mole|sarachnis|barrows|godwars|bandos|sara(?:domin)?|zamor(?:ak)?|armadyl|dagannoth kings|dks|vardorvis|duke sucellus|the leviathan|the whisperer)\b/i,
    // Skills
    /\b(attack|strength|defence|hitpoints|ranged|prayer|magic|runecrafting|construction|agility|herblore|thieving|crafting|fletching|slayer|hunter|mining|smithing|fishing|cooking|firemaking|woodcutting|farming|sailing)\b/i,
    // Quest names (common ones)
    /\b(dragon slayer|monkey madness|recipe for disaster|desert treasure|song of the elves|regicide|underground pass|legends quest|lunar diplomacy|dream mentor|a night at the theatre)\b/i,
  ];

  for (const pattern of topicPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }
  }

  return '';
}
