# Musing - Media & Copy

## Landing Page Copy

### Hero/Headline Options

> **"Your conversations inspire your quotes. Then they're gone."**

> **"We read between the lines. Then we forget them."**

> **"Context-aware quotes without the data footprint."**

### How It Works Section

```
1. Your conversation is sanitized locally (emails, keys, URLs stripped)
2. Themes are extracted in-memory — no logs, no storage
3. You get relevant quotes. We keep nothing.
```

### Technical Trust Block

> **Zero-retention architecture**
> Your conversation text is processed in a stateless Cloudflare Worker.
> Themes are extracted, quotes are matched, and the original text is discarded.
> No databases. No logs. No trace.

### One-liner

> "We extract meaning, not data."

---

## Twitter/X Copy

**Launch tweet:**

> Built a new tab extension that shows quotes based on your AI conversations.
>
> The twist: zero data retention. Your conversation is analyzed in-memory, matched to quotes, then discarded. No logs. No storage.
>
> Context-aware without the privacy tradeoff.

**Thread opener:**

> Most "personalized" apps store everything about you.
>
> Musing works differently:
> → Sanitizes sensitive data client-side
> → Extracts themes in a stateless worker
> → Returns quotes, forgets the rest
>
> Your context. Zero footprint.

**Short punchy versions:**

> "Personalization without the surveillance."

> "Your AI conversations → relevant quotes → zero retention."

> "We understand your context. We don't store it."

---

## Privacy Section

### Privacy by Architecture

| What happens | What we keep |
|--------------|--------------|
| Emails, API keys, URLs stripped client-side | Nothing |
| Conversation sent to stateless worker | Nothing |
| Themes extracted via LLM | Nothing |
| Quotes returned to you | Just the quotes |

No accounts. No tracking. No conversation logs.
