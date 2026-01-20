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
  error?: {
    message: string;
  };
}

/**
 * Parse JSON robustly - handles markdown blocks, trailing commas, etc.
 */
function parseJsonRobust(content: string): unknown {
  // Remove markdown code blocks
  let cleaned = content.replace(/```(?:json)?\s*\n?/g, "").replace(/\n?```/g, "");

  // Trim whitespace
  cleaned = cleaned.trim();

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON array from the content
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        // Continue to fallback
      }
    }

    // Try to extract JSON object
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        // Continue to fallback
      }
    }
  }

  return null;
}

/**
 * Extract themes from conversation using Groq
 */
async function extractThemes(
  conversation: string,
  apiKey: string
): Promise<string[]> {
  // Optimized prompt for gpt-oss - more direct, structured
  const systemPrompt = `Extract 3-5 themes from the conversation. Output a JSON array of lowercase strings only.

Examples:
["debugging", "async-programming", "learning"]
["career-change", "uncertainty", "growth"]
["writing", "creativity", "motivation"]

Theme categories:
- Technical: programming, algorithms, debugging, architecture
- Emotional: frustration, curiosity, excitement, anxiety
- Life: career, relationships, health, finance
- Abstract: complexity, persistence, patience, wisdom

Output ONLY the JSON array.`;

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: conversation.slice(0, 4000),
          },
        ] as GroqMessage[],
        temperature: 0.2, // Lower for more consistent JSON output
        max_tokens: 100, // Reduced - we only need a short array
        response_format: { type: "json_object" }, // Request JSON mode
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Groq API error: ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as GroqResponse;

  if (data.error) {
    throw new Error(data.error.message);
  }

  const content = data.choices[0]?.message?.content;
  if (!content) {
    return [];
  }

  // Parse the response
  const parsed = parseJsonRobust(content);

  // Handle different response formats
  if (Array.isArray(parsed)) {
    return parsed
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.toLowerCase().trim())
      .filter((t) => t.length > 0)
      .slice(0, 5);
  }

  // If JSON mode returned an object with themes array
  if (parsed && typeof parsed === "object" && "themes" in parsed) {
    const themes = (parsed as { themes: unknown }).themes;
    if (Array.isArray(themes)) {
      return themes
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase().trim())
        .filter((t) => t.length > 0)
        .slice(0, 5);
    }
  }

  // Fallback: extract words from content
  const words = content.toLowerCase().match(/[a-z][a-z-]+[a-z]/g) || [];
  return [...new Set(words)].filter((w) => w.length > 3).slice(0, 5);
}

/**
 * Find quotes matching themes using keyword overlap
 */
async function findQuotes(
  db: D1Database,
  themes: string[],
  count: number
): Promise<Quote[]> {
  if (themes.length === 0) {
    const result = await db
      .prepare(
        `SELECT id, text, author, themes FROM quotes ORDER BY RANDOM() LIMIT ?`
      )
      .bind(count)
      .all<Quote>();
    return result.results || [];
  }

  // Build relevance query
  const placeholders = themes.map(() => "themes LIKE ?").join(" OR ");
  const bindings = themes.map((t) => `%${t}%`);

  const relevanceExpr = themes
    .map(() => `(CASE WHEN themes LIKE ? THEN 1 ELSE 0 END)`)
    .join(" + ");

  const query = `
    SELECT id, text, author, themes,
      (${relevanceExpr}) as relevance
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

  // Pad with random quotes if needed
  if (quotes.length < count) {
    const existingIds = quotes.map((q) => q.id);
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok" });
    }

    // Main endpoint
    if (url.pathname === "/quotes" && request.method === "POST") {
      try {
        let body: QuoteRequest;
        try {
          body = (await request.json()) as QuoteRequest;
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const { conversation, count = 15 } = body;

        if (!conversation || typeof conversation !== "string") {
          return jsonResponse({ error: "conversation field required" }, 400);
        }

        if (conversation.trim().length < 10) {
          return jsonResponse(
            { error: "conversation too short" },
            400
          );
        }

        // Extract themes
        const themes = await extractThemes(
          conversation,
          env.MUSING_GROQ_API_KEY
        );

        // Find matching quotes
        const quotes = await findQuotes(env.DB, themes, Math.min(count, 30));

        return jsonResponse({
          themes,
          quotes: quotes.map((q) => ({
            id: q.id,
            text: q.text,
            author: q.author,
          })),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[Musing API Error]", message);
        return jsonResponse({ error: message }, 500);
      }
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};
