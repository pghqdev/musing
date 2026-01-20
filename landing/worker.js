export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle waitlist form submission
    if (url.pathname === '/api/waitlist' && request.method === 'POST') {
      try {
        const { email } = await request.json();

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
          return new Response(
            JSON.stringify({ success: false, message: 'Please enter a valid email address.' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Check if email already exists
        const existing = await env.musing_waitlist.get(email.toLowerCase());
        if (existing) {
          return new Response(
            JSON.stringify({ success: false, message: 'This email is already on the waitlist!' }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Store email with metadata
        const data = {
          timestamp: new Date().toISOString(),
          userAgent: request.headers.get('User-Agent') || 'unknown',
        };
        await env.musing_waitlist.put(email.toLowerCase(), JSON.stringify(data));

        return new Response(
          JSON.stringify({ success: true, message: "You're on the list! We'll notify you when Musing launches." }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, message: 'Something went wrong. Please try again.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Proxy Umami script
    if (url.pathname === '/a/script.js') {
      const response = await fetch('https://cloud.umami.is/script.js');
      const script = await response.text();
      // Rewrite the API endpoint to use our proxy
      const modified = script.replace(
        /https:\/\/cloud\.umami\.is/g,
        url.origin + '/a'
      );
      return new Response(modified, {
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // Proxy Umami API calls
    if (url.pathname.startsWith('/a/api/')) {
      const targetUrl = 'https://cloud.umami.is' + url.pathname.replace('/a', '');
      return fetch(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== 'GET' ? request.body : undefined,
      });
    }

    // Proxy Cloudflare Insights script
    if (url.pathname === '/c/beacon.js') {
      const response = await fetch('https://static.cloudflareinsights.com/beacon.min.js');
      return new Response(response.body, {
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // Serve static assets
    return env.ASSETS.fetch(request);
  },
};
