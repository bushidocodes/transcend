/**
 * Regression: unmatched non-GET requests must get a 404 rather than hang (issue #179).
 * Exercises the shipped notFound middleware in the same ordering as server/index.ts
 * (SPA GET catch-all, then notFound, then 4-arg error middleware).
 */

import type http from 'http';
import type { AddressInfo } from 'net';
import express, { type NextFunction, type Request, type Response } from 'express';
import { notFound } from './not-found.ts';

let server: http.Server;
let baseUrl: string;

beforeAll(
  () =>
    new Promise<void>(resolve => {
      const app = express();
      // Minimal stand-in for the real SPA GET handler.
      app.get('/{*path}', (_req, res) => {
        res.status(200).send('spa');
      });
      app.use(notFound);
      // Real error middleware only runs on next(err); must not swallow 404s.
      app.use(
        (err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
          res.sendStatus(err.status || 500);
        }
      );
      server = app.listen(0, () => {
        baseUrl = 'http://localhost:' + (server.address() as AddressInfo).port;
        resolve();
      });
    })
);

afterAll(() => new Promise(resolve => server.close(resolve)));

describe('unmatched non-GET 404 (issue #179)', () => {
  it('GET still hits the SPA catch-all', async () => {
    const res = await fetch(baseUrl + '/vr/lobby');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('spa');
  });

  it('POST to a non-API path returns 404 (does not hang)', async () => {
    const res = await fetch(baseUrl + '/vr/lobby', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('PUT and DELETE also get 404', async () => {
    const put = await fetch(baseUrl + '/some/path', { method: 'PUT' });
    const del = await fetch(baseUrl + '/other', { method: 'DELETE' });
    expect(put.status).toBe(404);
    expect(del.status).toBe(404);
  });
});
