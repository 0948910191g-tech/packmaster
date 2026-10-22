import { verifyCloudflareAccessIdentity } from '../lib/cloudflare-access.mjs';

export async function onRequest(context) {
  try {
    context.data.packMasterIdentity = await verifyCloudflareAccessIdentity(
      context.request,
      context.env
    );
    return await context.next();
  } catch (error) {
    const status = Number(error && error.status) || 401;
    return Response.json({
      error: error && error.message ? error.message : 'Access denied',
      code: error && error.code ? error.code : 'ACCESS_DENIED'
    }, {
      status,
      headers: { 'Cache-Control': 'no-store' }
    });
  }
}