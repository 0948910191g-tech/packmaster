export function onRequestGet({ request }) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL('/', request.url).toString(),
      'Cache-Control': 'no-store'
    }
  });
}