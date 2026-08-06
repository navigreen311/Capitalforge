# Two-factor authentication does not exist

**Status:** open, unscoped. **Not a false-success defect** — it is an
authentication control the interface offers, the user completes, and the system
does not have. Filed separately from `false-success-audit.md` for that reason:
the audit is about claims made for writes that did not happen, and this is a
security control that is absent while the UI says otherwise.

Found 2026-08-05, during the capability-scoped pass of that audit.

**Do not build from this document.** It states what is wrong, not what to
build; the design questions at the end are unanswered on purpose.

---

## 1. The secrets live in a process-local Map

`src/backend/api/routes/two-factor.routes.ts`:

```ts
const twoFactorStore = new Map<string, TwoFactorRecord>();
```

Every path uses it. `/setup` writes the secret there, `/verify` flips
`enabled`, `/disable` deletes the entry. **Nothing reaches the database.**

Two consequences, both silent:

- **A server restart disables 2FA for every user.** The map empties, the
  status endpoint reports `enabled: false`, and the next login proceeds
  straight through. Nobody is told; nothing is logged; the user's next sign-in
  simply does not ask for a code.
- **With more than one instance, the answer depends which one you reach.** A
  user can enrol against instance A and be un-enrolled from the perspective of
  instance B, and the two are equally authoritative.

## 2. The challenge is advisory, because the tokens are issued first

This is the more serious half.

`src/frontend/app/login/page.tsx`:

```ts
localStorage.setItem('cf_access_token', accessToken);      // ← session exists
localStorage.setItem('cf_refresh_token', refreshToken);
localStorage.setItem('cf_user', JSON.stringify(user));

const tfaRes = await fetch('/api/auth/2fa/status', { ... }); // ← then we ask
if (tfaData.data?.enabled) {
  router.push('/login/two-factor');                          // ← then we redirect
}
```

The access token and refresh token are in `localStorage` **before** the second
factor is requested. The redirect to `/login/two-factor` is a client-side
navigation over an already-authenticated session.

**Anyone who does not follow the redirect is already signed in.** Closing the
tab at the challenge, navigating directly to any route, or calling the API
with the token that was just issued all work. No backend route requires that
the challenge was completed, because nothing records that it was.

A real second factor **gates token issue rather than following it**: the
password step returns a short-lived challenge, not a session, and tokens are
issued only when the second factor is verified.

---

## Why this is not on the false-success list

Everything on that list reports a write that did not happen. This reports a
*state* that does not exist — and it passes the audit's own search rule
cleanly. Both directions of the capability behave identically and consistently;
they are simply both unreal. That is the case the rule's "symmetry is not
evidence" caveat exists for, and it is why this needed a separate document
rather than another row.

---

## Scoping questions — unanswered, deliberately

Each of these changes what gets built. None should be settled while writing the
code.

**Where do secrets live, and how are they encrypted at rest?** A TOTP secret is
a credential: whoever holds it can generate valid codes forever. It cannot sit
in a plain column beside the password hash and be treated as ordinary profile
data. Which key, held where, rotated how.

**Does the challenge gate token issue?** The correct answer is yes, and it
changes the login contract: `/auth/login` stops returning a session for
2FA-enabled users and starts returning a challenge. Every client of that
endpoint has to change with it.

**Recovery codes.** Without them, a lost device is a lost account, and support
will route around the control — which is worse than not having it, because the
bypass becomes routine and undocumented.

**What happens to sessions established under the current scheme?** Every
existing token was issued without a real second factor. Enforcing the new one
leaves the question of whether those sessions are honoured, expired
immediately, or expired at their natural end. Silently honouring them means
the control does not apply to anyone already signed in.

**Rate limiting and replay.** A six-digit code with no attempt limit is a
five-minute brute force. TOTP also needs used codes rejected within their
window.

---

## Related

- `docs/gaps.md` — the endpoint row and the planning pointer.
- `docs/backlog/false-success-audit.md` — the search rule that surfaced it, and
  the "symmetry is not evidence" caveat that explains why a reverse-direction
  check passed it.
- `docs/backlog/tenant-suspension.md` — found in the same pass, same shape:
  a control that reports success without being enforceable.
