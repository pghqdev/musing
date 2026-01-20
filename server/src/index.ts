/**
 * LLM Quotes API - Cloudflare Worker
 * Extracts themes from conversation text and returns matching historical quotes
 */

interface Env {
  DB: D1Database;
  MUSING_GROQ_API_KEY: string;
}

interface QuoteRequest {
  conversation: string;
  count?: number;
}

interface Quote {
  id: number;
  text: string;
  author: string;
  themes: string[];
}

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GroqResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// Extract themes from conversation using Groq
async function extractThemes(conversation: string, apiKey: string): Promise<string[]> {
  const systemPrompt = `You extract themes from conversations. Given a conversation with an AI assistant, identify 3-5 core themes or topics being discussed.

Return ONLY a JSON array of lowercase theme strings. Examples of good themes:
- "debugging", "async-programming", "frustration", "learning"
- "career-change", "decision-making", "uncertainty", "growth"
- "writing", "creativity", "procrastination", "motivation"

Focus on:
1. Technical topics (programming, math, science, etc.)
2. Emotional undertones (frustration, curiosity, excitement)
3. Life situations (career, relationships, health, learning)
4. Abstract concepts (complexity, simplicity, patience, persistence)

Return ONLY the JSON array, no explanation.`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: conversation.slice(0, 4000) }, // Limit input size
      ] as GroqMessage[],
      temperature: 0.3,
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${error}`);
  }

  const data = (await response.json()) as GroqResponse;
  const content = data.choices[0]?.message?.content || "[]";

  try {
    // Clean potential markdown code blocks
    const cleaned = content.replace(/```json?\n?|\n?```/g, "").trim();
    const themes = JSON.parse(cleaned);
    if (Array.isArray(themes)) {
      return themes.map((t: unknown) => String(t).toLowerCase());
    }
  } catch {
    // Fallback: extract words that look like themes
    const words = content.toLowerCase().match(/[\w-]+/g) || [];
    return words.filter((w) => w.length > 3).slice(0, 5);
  }

  return [];
}

// Find quotes matching themes using simple keyword overlap
// In production, replace with vector similarity search
async function findQuotes(
  db: D1Database,
  themes: string[],
  count: number
): Promise<Quote[]> {
  if (themes.length === 0) {
    // Return random quotes if no themes extracted
    const result = await db
      .prepare(
        `SELECT id, text, author, themes FROM quotes ORDER BY RANDOM() LIMIT ?`
      )
      .bind(count)
      .all<Quote>();
    return result.results || [];
  }

  // Build query to match any theme
  // Uses JSON array stored in themes column
  const placeholders = themes.map(() => "themes LIKE ?").join(" OR ");
  const bindings = themes.map((t) => `%${t}%`);

  const query = `
    SELECT id, text, author, themes,
      (${themes.map(() => `(CASE WHEN themes LIKE ? THEN 1 ELSE 0 END)`).join(" + ")}) as relevance
    FROM quotes
    WHERE ${placeholders}
    ORDER BY relevance DESC, RANDOM()
    LIMIT ?
  `;

  const allBindings = [...bindings, ...bindings, count];

  const result = await db
    .prepare(query)
    .bind(...allBindings)
    .all<Quote>();

  const quotes = result.results || [];

  // If not enough themed quotes, pad with random ones
  if (quotes.length < count) {
    const existingIds = quotes.map((q: Quote) => q.id);
    const excludeClause =
      existingIds.length > 0
        ? `WHERE id NOT IN (${existingIds.join(",")})`
        : "";
    const padResult = await db
      .prepare(
        `SELECT id, text, author, themes FROM quotes ${excludeClause} ORDER BY RANDOM() LIMIT ?`
      )
      .bind(count - quotes.length)
      .all<Quote>();
    quotes.push(...(padResult.results || []));
  }

  return quotes;
}

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Main endpoint
    if (url.pathname === "/quotes" && request.method === "POST") {
      try {
        const body = (await request.json()) as QuoteRequest;
        const { conversation, count = 15 } = body;

        if (!conversation || typeof conversation !== "string") {
          return new Response(
            JSON.stringify({ error: "conversation field required" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Extract themes
        const themes = await extractThemes(conversation, env.MUSING_GROQ_API_KEY);

        // Find matching quotes
        const quotes = await findQuotes(
          env.DB,
          themes,
          Math.min(count, 30) // Cap at 30
        );

        return new Response(
          JSON.stringify({
            themes,
            quotes: quotes.map((q) => ({
              id: q.id,
              text: q.text,
              author: q.author,
            })),
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};
