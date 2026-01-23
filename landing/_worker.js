export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
