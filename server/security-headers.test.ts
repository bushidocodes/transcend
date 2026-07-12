/**
 * Unit tests for security headers middleware wiring (issue #201).
 *
 * Helmet is applied early on the Express app; these tests pin that a minimal app with the
 * same helmet config sets X-Content-Type-Options / CSP and does not advertise X-Powered-By.
 */

import type http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import helmet from 'helmet';

let server: http.Server;
let baseUrl: string;

// Same CSP knobs as server/index.ts — keep in sync when adjusting A-Frame allowances.
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      mediaSrc: ["'self'", 'blob:'],
      workerSrc: ["'self'", 'blob:'],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
});

beforeAll(
  () =>
    new Promise<void>(resolve => {
      const app = express();
      app.disable('x-powered-by');
      app.use(helmetMiddleware);
      app.get('/probe', (_req, res) => {
        res.status(200).send('ok');
      });
      server = app.listen(0, () => {
        baseUrl = 'http://localhost:' + (server.address() as AddressInfo).port;
        resolve();
      });
    })
);

afterAll(() => new Promise(resolve => server.close(resolve)));

describe('security headers (issue #201)', () => {
  it('does not send X-Powered-By', async () => {
    const res = await fetch(baseUrl + '/probe');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await fetch(baseUrl + '/probe');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('sets a Content-Security-Policy allowing self scripts and websocket connect', async () => {
    const res = await fetch(baseUrl + '/probe');
    const csp = res.headers.get('content-security-policy') || '';
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/script-src[^;]*'self'/);
    expect(csp).toMatch(/connect-src[^;]*'self'/);
  });
});
