/**
 * Catch-all for methods/paths that match no earlier route (issue #179).
 *
 * Express only runs the SPA `app.get('/{*path}')` for GET. A POST/PUT/DELETE to a non-API
 * path used to hang with no response until the client timed out. Register this after route
 * definitions and before the 4-arg error middleware.
 */
import type { Request, Response } from 'express';

export function notFound (_req: Request, res: Response): void {
  res.status(404).end();
}
