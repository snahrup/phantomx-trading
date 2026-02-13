// ============================================================================
// PhantomX — News Agent (Crypto News Sentiment)
// ============================================================================
// Monitors crypto news via CryptoPanic's free API. Classifies sentiment
// from vote ratios and source quality. Publishes news signals to Signal Bus.
// No AI calls — algorithmic sentiment from community votes + keyword analysis.
// ============================================================================

import { BaseAgent } from './base-agent';
import type { AgentSentiment } from '@/types/trading';

interface CryptoPanicPost {
  kind: string;
  domain: string;
  title: string;
  published_at: string;
  slug: string;
  currencies?: Array<{ code: string; title: string; slug: string }>;
  votes: {
    negative: number;
    positive: number;
    important: number;
    liked: number;
    disliked: number;
    lol: number;
    toxic: number;
    saved: number;
    comments: number;
  };
}

interface CryptoPanicResponse {
  count: number;
  results: CryptoPanicPost[];
}

// Keywords that shift sentiment
const BULLISH_KEYWORDS = [
  'surge', 'rally', 'breakout', 'all-time high', 'ath', 'bullish', 'pump',
  'approval', 'etf', 'adoption', 'partnership', 'launch', 'upgrade', 'milestone',
  'institutional', 'accumulation', 'golden cross', 'recovery', 'moonshot',
];
const BEARISH_KEYWORDS = [
  'crash', 'dump', 'plunge', 'hack', 'exploit', 'ban', 'regulation',
  'sec', 'lawsuit', 'bankrupt', 'insolvency', 'death cross', 'capitulation',
  'sell-off', 'selloff', 'liquidation', 'fud', 'scam', 'rug', 'delisting',
];

export class NewsAgent extends BaseAgent {
  readonly id = 'news' as const;
  readonly name = 'News (Headlines)';
  readonly defaultIntervalMs = 300_000; // 5 minutes

  protected async tick(): Promise<void> {
    const posts = await this.fetchNews();

    if (posts.length === 0) {
      this.emit({
        type: 'agent_tick',
        agentId: this.id,
        data: { postCount: 0, error: 'No news fetched' },
        timestamp: Date.now(),
      });
      return;
    }

    // Score each post
    const scored = posts.map(post => this.scorePost(post));

    // Aggregate
    const totalScore = scored.reduce((sum, s) => sum + s.score, 0);
    const avgScore = scored.length > 0 ? totalScore / scored.length : 0;
    const bullishCount = scored.filter(s => s.score > 0).length;
    const bearishCount = scored.filter(s => s.score < 0).length;
    const neutralCount = scored.filter(s => s.score === 0).length;

    // Normalize to 0-100 scale (avgScore typically -5 to +5)
    const normalizedScore = Math.max(0, Math.min(100, Math.round(50 + avgScore * 10)));

    let sentiment: AgentSentiment = 'neutral';
    if (normalizedScore >= 60) sentiment = 'bullish';
    else if (normalizedScore <= 40) sentiment = 'bearish';

    const confidence = Math.min(100, Math.round(
      Math.abs(normalizedScore - 50) * 2 * Math.min(1, posts.length / 5)
    ));

    // Extract mentioned symbols
    const mentionedSymbols = new Map<string, number>();
    for (const post of posts) {
      for (const currency of (post.currencies ?? [])) {
        const code = currency.code.toUpperCase();
        mentionedSymbols.set(code, (mentionedSymbols.get(code) ?? 0) + 1);
      }
    }
    const topMentioned = Array.from(mentionedSymbols.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([symbol, count]) => ({ symbol, mentions: count }));

    // Top headlines for the Commander
    const topHeadlines = scored
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 5)
      .map(s => ({
        title: s.title,
        score: s.score,
        sentiment: s.score > 0 ? 'bullish' : s.score < 0 ? 'bearish' : 'neutral',
        currencies: s.currencies,
      }));

    this.emit({
      type: 'agent_tick',
      agentId: this.id,
      data: {
        postCount: posts.length,
        bullishCount,
        bearishCount,
        neutralCount,
        normalizedScore,
        topMentioned: topMentioned.slice(0, 5),
      },
      timestamp: Date.now(),
    });

    this.publish({
      confidence,
      sentiment,
      summary: `${posts.length} recent headlines: ${bullishCount} bullish, ${bearishCount} bearish, ${neutralCount} neutral. News score: ${normalizedScore}/100. Top mentioned: ${topMentioned.slice(0, 3).map(t => t.symbol).join(', ') || 'none'}.`,
      data: {
        postCount: posts.length,
        bullishCount,
        bearishCount,
        neutralCount,
        normalizedScore,
        avgScore: Math.round(avgScore * 100) / 100,
        topMentioned,
        topHeadlines,
      },
    });
  }

  private scorePost(post: CryptoPanicPost): {
    title: string;
    score: number;
    currencies: string[];
  } {
    let score = 0;
    const titleLower = post.title.toLowerCase();

    // Keyword analysis
    for (const kw of BULLISH_KEYWORDS) {
      if (titleLower.includes(kw)) score += 1;
    }
    for (const kw of BEARISH_KEYWORDS) {
      if (titleLower.includes(kw)) score -= 1;
    }

    // Community vote analysis
    const { positive, negative, important, liked, disliked, toxic } = post.votes;
    const voteNet = (positive + liked) - (negative + disliked + toxic);
    if (voteNet > 2) score += 1;
    else if (voteNet < -2) score -= 1;

    // Important flag boosts magnitude
    if (important > 3) {
      score = score > 0 ? score + 1 : score < 0 ? score - 1 : score;
    }

    return {
      title: post.title,
      score,
      currencies: (post.currencies ?? []).map(c => c.code.toUpperCase()),
    };
  }

  private async fetchNews(): Promise<CryptoPanicPost[]> {
    try {
      // CryptoPanic free tier (no auth key needed for public filter)
      const res = await fetch(
        'https://cryptopanic.com/api/free/v1/posts/?auth_token=0000000000000000000000000000000000000000&public=true&kind=news',
        { signal: AbortSignal.timeout(10_000) }
      );

      if (!res.ok) {
        // Fallback: try without auth token (some endpoints work)
        return this.fetchNewsFallback();
      }

      const data = (await res.json()) as CryptoPanicResponse;
      return data.results ?? [];
    } catch {
      return this.fetchNewsFallback();
    }
  }

  private async fetchNewsFallback(): Promise<CryptoPanicPost[]> {
    // If CryptoPanic is unavailable, return empty — agent will report 0 posts
    // Future: add alternative news sources here
    return [];
  }
}
