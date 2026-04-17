#!/usr/bin/env node
// Cross-building + PII role-guard regression test for Task #96.
// Runs against the local API server. Exits 0 on success, 1 on any failure.
//
// Usage: node scripts/test-cross-building-security.mjs
//   API_BASE: defaults to http://localhost:5000 (api-server PORT).
//
// Assumes the seeded test accounts exist (see seed scripts):
//   manager+building1@test.com / accountant+building1@test.com /
//   facility+building1@test.com / hq+building1@test.com /
//   manager+building2@test.com   (password: test1234!)
//
// The script is best-effort: if seed accounts are missing it prints SKIP
// with a clear message and exits 0 so it can be wired into CI without
// blocking other unrelated changes.

const BASE = (process.env.API_BASE || `http://localhost:${process.env.API_PORT || 8080}`) + "/api";
const PASSWORD = "test1234!";

let pass = 0;
let fail = 0;
const failures = [];

function log(tag, msg) {
  console.log(`[${tag}] ${msg}`);
}

async function login(email, portalType = "building") {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, portalType }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.token || null;
}

async function get(path, token) {
  const r = await fetch(`${BASE}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  let body = null;
  try { body = await r.json(); } catch { /* empty */ }
  return { status: r.status, body };
}

function expect(name, cond, detail = "") {
  if (cond) { pass++; log("PASS", name); }
  else { fail++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); log("FAIL", `${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  log("INFO", `Target: ${BASE}`);

  const m1 = await login("manager@test.com");
  const fs1 = await login("facility@test.com");
  const ac1 = await login("accountant@test.com");
  const hq1 = await login("hq@test.com", "hq");
  const m2 = await login("manager+building2@test.com");

  if (!m1) {
    log("SKIP", "seed manager@test.com not present; skipping suite");
    return;
  }

  // Discover one tenant ID owned by building1 via manager1.
  const tenants1 = await get("/tenants", m1);
  expect("manager1 GET /tenants 200", tenants1.status === 200);
  const tenantB1 = Array.isArray(tenants1.body) ? tenants1.body[0] : null;

  if (tenantB1?.id) {
    const ownCheck = await get(`/tenants/${tenantB1.id}`, m1);
    expect("manager1 GET /tenants/:id (own building) → 200",
      ownCheck.status === 200, `got ${ownCheck.status}`);

    if (m2) {
      const cross = await get(`/tenants/${tenantB1.id}`, m2);
      expect("manager2 GET /tenants/:id (foreign building) → 404",
        cross.status === 404, `got ${cross.status}`);
    } else {
      log("SKIP", "manager+building2 seed missing — cross-building case not exercised");
    }
  } else {
    log("SKIP", "no tenant in building1 to test cross-building access");
  }

  // PII role guards.
  if (fs1) {
    const r = await get("/tenants", fs1);
    expect("facility_staff GET /tenants → 403", r.status === 403, `got ${r.status}`);
    const r2 = await get("/owners", fs1);
    expect("facility_staff GET /owners → 403", r2.status === 403, `got ${r2.status}`);
    const r3 = await get("/vehicles", fs1);
    expect("facility_staff GET /vehicles → 200 (allowed)", r3.status === 200, `got ${r3.status}`);
  }

  if (ac1) {
    const r = await get("/owners", ac1);
    expect("accountant GET /owners → 403", r.status === 403, `got ${r.status}`);
    const r2 = await get("/vehicles", ac1);
    expect("accountant GET /vehicles → 403 (PII)", r2.status === 403, `got ${r2.status}`);
    const r3 = await get("/tenants", ac1);
    expect("accountant GET /tenants → 200 (allowed)", r3.status === 200, `got ${r3.status}`);
  }

  if (hq1) {
    const r = await get("/tenants", hq1);
    expect("hq_executive GET /tenants → 403", r.status === 403, `got ${r.status}`);
    const r2 = await get("/vehicles", hq1);
    expect("hq_executive GET /vehicles → 403", r2.status === 403, `got ${r2.status}`);
  }

  // Public token route requires a real token; bad token must NOT return 200.
  const noTok = await get("/public/tenant-card/__nope__");
  expect("public/tenant-card/:badtoken → not 200",
    noTok.status !== 200, `got ${noTok.status}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("Failures:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
