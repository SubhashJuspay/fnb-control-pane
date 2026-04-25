import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function proxy(req: NextRequest): Promise<Response> {
  const target = env.INTERNAL_API_URL ?? 'http://api:4000/graphql';

  const headers = new Headers();
  // Forward content-type and accept so the api can parse the request and pick
  // the right response format (JSON vs SSE vs multipart).
  const ct = req.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  const acc = req.headers.get('accept');
  if (acc) headers.set('accept', acc);
  // Forward tenant/location headers from the urql client.
  const ts = req.headers.get('x-tenant-slug');
  if (ts) headers.set('x-tenant-slug', ts);
  const li = req.headers.get('x-location-id');
  if (li) headers.set('x-location-id', li);
  // Forward the original cookie so the api's verifySession can decode the
  // Auth.js session JWT. Single auth path; we don't inject custom user headers.
  const cookie = req.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  // Optional: forward request id for log correlation.
  const rid = req.headers.get('x-request-id');
  if (rid) headers.set('x-request-id', rid);

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }

  const upstream = await fetch(target, init);
  const respHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    // Strip content-encoding — fetch already decoded the body, and forwarding
    // the original encoding header would tell the browser to re-decode.
    if (key.toLowerCase() === 'content-encoding') return;
    respHeaders.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const OPTIONS = proxy;
