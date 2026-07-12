/**
 * Unit tests for Google OAuth account resolution (issue #171).
 *
 * The strategy verify callback is thin; the real logic lives in resolveGoogleProfile
 * (pure) and resolveGoogleUser (DB). Tests call those helpers with a mocked User model.
 */

// Passport-google-oauth20's strategy constructor (run at module load of ./auth.ts) throws
// without a clientID, so dummies must be in place before the router loads.
const mockUser = vi.hoisted(() => {
  process.env.CLIENT_ID = process.env.CLIENT_ID || 'dummy-client-id';
  process.env.CLIENT_SECRET = process.env.CLIENT_SECRET || 'dummy-client-secret';
  return {
    create: vi.fn(),
    findByPk: vi.fn(),
    findOne: vi.fn(),
    findOrCreate: vi.fn()
  };
});

vi.mock('../db/models/user.ts', () => ({ default: mockUser, User: mockUser }));

import { resolveGoogleProfile, resolveGoogleUser } from './auth.ts';

beforeEach(() => {
  mockUser.findOne.mockReset();
  mockUser.findOrCreate.mockReset();
});

describe('resolveGoogleProfile (issue #171)', () => {
  it('extracts email, name, displayName, and googleId', () => {
    const result = resolveGoogleProfile({
      id: 'g-123',
      displayName: 'Ada Lovelace',
      emails: [{ value: 'Ada@Example.com' }]
    });
    expect(result).toEqual({
      googleId: 'g-123',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      // Truncated to 8 chars to match local signup limits.
      displayName: 'Ada Love',
      emailVerified: false
    });
  });

  it('falls back displayName from the email local-part when profile.displayName is missing', () => {
    const result = resolveGoogleProfile({
      id: 'g-456',
      emails: [{ value: 'longusername@example.com' }]
    });
    expect(result).toEqual({
      googleId: 'g-456',
      email: 'longusername@example.com',
      name: 'longuser',
      displayName: 'longuser',
      emailVerified: false
    });
  });

  it('returns an error when the profile has no email', () => {
    expect(resolveGoogleProfile({ id: 'g-789' })).toEqual({
      error: 'Google account has no email'
    });
    expect(resolveGoogleProfile({ id: 'g-789', emails: [] })).toEqual({
      error: 'Google account has no email'
    });
  });

  // Issue #229: emailVerified only when Google asserts it.
  it('sets emailVerified from emails[0].verified', () => {
    const result = resolveGoogleProfile({
      id: 'g-v',
      emails: [{ value: 'v@example.com', verified: true }]
    });
    expect(result).toMatchObject({ emailVerified: true });
  });

  it('sets emailVerified from profile._json.email_verified', () => {
    const result = resolveGoogleProfile({
      id: 'g-j',
      emails: [{ value: 'j@example.com' }],
      _json: { email_verified: true }
    });
    expect(result).toMatchObject({ emailVerified: true });
  });

  it('treats missing verified flags as emailVerified: false', () => {
    const result = resolveGoogleProfile({
      id: 'g-u',
      emails: [{ value: 'u@example.com' }]
    });
    expect(result).toMatchObject({ emailVerified: false });
  });
});

describe('resolveGoogleUser (issue #171)', () => {
  it('returns false when the profile has no email (no DB calls)', async () => {
    const result = await resolveGoogleUser({ id: 'g-none' });
    expect(result).toBe(false);
    expect(mockUser.findOne).not.toHaveBeenCalled();
    expect(mockUser.findOrCreate).not.toHaveBeenCalled();
  });

  it('returns an existing user matched by googleId', async () => {
    const existing = { id: 1, googleId: 'g-1', email: 'a@b.com' };
    mockUser.findOne.mockResolvedValueOnce(existing);

    const result = await resolveGoogleUser({
      id: 'g-1',
      displayName: 'Alice',
      emails: [{ value: 'a@b.com' }]
    });

    expect(result).toBe(existing);
    expect(mockUser.findOne).toHaveBeenCalledWith({ where: { googleId: 'g-1' } });
    expect(mockUser.findOrCreate).not.toHaveBeenCalled();
  });

  it('links googleId onto an existing local account with the same verified email', async () => {
    const local = {
      id: 2,
      email: 'local@example.com',
      googleId: null,
      displayName: 'Local',
      name: null,
      update: vi.fn().mockImplementation(function (
        this: typeof local,
        attrs: Record<string, unknown>
      ) {
        Object.assign(this, attrs);
        return Promise.resolve(this);
      })
    };
    // First findOne: by googleId → miss; second: by email → hit.
    mockUser.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(local);

    const result = await resolveGoogleUser({
      id: 'g-new',
      displayName: 'FromGoogle',
      emails: [{ value: 'Local@Example.com', verified: true }]
    });

    expect(mockUser.findOne).toHaveBeenNthCalledWith(1, { where: { googleId: 'g-new' } });
    expect(mockUser.findOne).toHaveBeenNthCalledWith(2, { where: { email: 'local@example.com' } });
    expect(local.update).toHaveBeenCalledWith({
      googleId: 'g-new',
      // Keep existing displayName; fill blank name from Google.
      displayName: 'Local',
      name: 'FromGoogle'
    });
    expect(result).toBe(local);
    expect(mockUser.findOrCreate).not.toHaveBeenCalled();
  });

  // Issue #229: never auto-link when the Google email is not verified.
  it('refuses to link when a local account matches but the email is unverified', async () => {
    const local = {
      id: 2,
      email: 'victim@example.com',
      googleId: null,
      displayName: 'Victim',
      name: null,
      update: vi.fn()
    };
    mockUser.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(local);

    const result = await resolveGoogleUser({
      id: 'g-attacker',
      displayName: 'Attacker',
      emails: [{ value: 'victim@example.com', verified: false }]
    });

    expect(result).toBe(false);
    expect(local.update).not.toHaveBeenCalled();
    expect(mockUser.findOrCreate).not.toHaveBeenCalled();
  });

  it('refuses to link when email_verified is missing and a local account matches', async () => {
    const local = {
      id: 4,
      email: 'victim2@example.com',
      googleId: null,
      displayName: 'V2',
      name: null,
      update: vi.fn()
    };
    mockUser.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(local);

    const result = await resolveGoogleUser({
      id: 'g-no-flag',
      displayName: 'NoFlag',
      emails: [{ value: 'victim2@example.com' }]
    });

    expect(result).toBe(false);
    expect(local.update).not.toHaveBeenCalled();
  });

  it('links when email_verified is true via _json even if emails[].verified is absent', async () => {
    const local = {
      id: 5,
      email: 'json@example.com',
      googleId: null,
      displayName: 'Json',
      name: null,
      update: vi.fn().mockResolvedValue(undefined)
    };
    mockUser.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(local);

    const result = await resolveGoogleUser({
      id: 'g-json',
      displayName: 'FromJson',
      emails: [{ value: 'json@example.com' }],
      _json: { email_verified: true }
    });

    expect(local.update).toHaveBeenCalled();
    expect(result).toBe(local);
  });

  it('creates a new user with displayName when neither googleId nor email matches', async () => {
    const created = {
      id: 3,
      googleId: 'g-create',
      email: 'new@example.com',
      displayName: 'New User',
      name: 'New User'
    };
    mockUser.findOne.mockResolvedValue(null);
    mockUser.findOrCreate.mockResolvedValue([created, true]);

    const result = await resolveGoogleUser({
      id: 'g-create',
      displayName: 'New User',
      emails: [{ value: 'new@example.com' }]
    });

    expect(mockUser.findOrCreate).toHaveBeenCalledWith({
      where: { googleId: 'g-create' },
      defaults: {
        name: 'New User',
        email: 'new@example.com',
        displayName: 'New User',
        googleId: 'g-create'
      }
    });
    expect(result).toBe(created);
  });
});
