# Security notes

## npm audit: `uuid` via Sequelize (issue #245)

### Advisory

`npm audit` reported **moderate** findings for `uuid` **&lt; 11.1.1**
([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)): missing
buffer bounds checks in v3/v5/v6 when a caller-supplied `buf` is provided.

The only path into the tree was **Sequelize** (`sequelize@^6` → `uuid@^8.3.2`).
`npm audit fix --force` would install **sequelize@3.30.0** — a breaking major
downgrade. **Do not run it.**

### Exposure without a force-fix

Real exposure in this app is low: the vulnerable path requires an
attacker-controlled `buf` argument to uuid v3/v5/v6, which Sequelize does not
expose to user input. That assessment alone would be enough to **accept** the
finding until Sequelize bumps its `uuid` range.

### Mitigation shipped

We force a patched `uuid` with an npm override (verified with `npm test`):

```json
"overrides": {
  "uuid": "^11.1.1"
}
```

Pin to the **11.x** line (not `>=11.1.1`, which can resolve to uuid 14+).
uuid 14 is ESM-only; Sequelize still `require('uuid')` from CJS, which only
works on Node ≥ 20.19 / 22.12 / 24 via `require(esm)`. Staying on 11.x avoids
depending on that interop. The app already requires Node ≥ 24 (`engines`), so
either pin would boot today — 11.x is the conservative choice.

After install, Sequelize resolves `uuid@^11.1.1` and `npm audit` reports
**0 vulnerabilities**. Re-check on each Sequelize release; remove the override
when upstream depends on a fixed range.
