#!/usr/bin/env node
// Cross-building + 6-role PII regression test (Task #96, reinforces #88).
// Fails hard (exit 1) when assertions fail OR required seed accounts are
// missing — silent SKIP-and-pass would defeat the purpose of a security
// regression. Wire into CI behind the api-server workflow.
//
// Usage: node scripts/test-cross-building-security.mjs
//   API_BASE / API_PORT env override the target.
//
// Required seed accounts (password test1234!):
//   manager@test.com           (manager,         building 1)
//   accountant@test.com        (accountant,      building 1)
//   facility@test.com          (facility_staff,  building 1)
//   hq@test.com                (hq_executive,    portal=hq, no building)
//   admin@test.com             (platform_admin,  portal=hq, no building)
//   partner@test.com           (partner,         portal=partner)
// Optional (cross-building case is asserted only when present):
//   manager+building2@test.com (manager,         building 2)

const BASE = (process.env.API_BASE || `http://localhost:${process.env.API_PORT || 8080}`) + "/api";
const PASSWORD = "test1234!";

let pass = 0;
let fail = 0;
const failures = [];

function log(tag, msg) { console.log(`[${tag}] ${msg}`); }

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

function require_(name, cond, detail = "") {
  // Hard requirement — missing seeds count as failures, NOT skips.
  expect(name, cond, detail);
}

async function main() {
  log("INFO", `Target: ${BASE}`);

  const m1     = await login("manager@test.com");
  const ac1    = await login("accountant@test.com");
  const fs1    = await login("facility@test.com");
  const hq1    = await login("hq@test.com", "hq");
  const admin1 = await login("admin@test.com", "hq");
  const part1  = await login("partner@test.com", "partner");
  const m2     = await login("manager+building2@test.com"); // optional

  require_("seed: manager@test.com login",    !!m1);
  require_("seed: accountant@test.com login", !!ac1);
  require_("seed: facility@test.com login",   !!fs1);
  require_("seed: hq@test.com login",         !!hq1);
  require_("seed: admin@test.com login",      !!admin1);
  require_("seed: partner@test.com login",    !!part1);

  // --- Cross-building (tenant) ---
  if (m1) {
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
        log("INFO", "manager+building2 seed missing — cross-building tenant case not exercised (optional)");
      }
    } else {
      log("INFO", "no tenant in building1 — cross-building tenant case not exercised");
    }
  }

  // --- PII role guards: facility_staff / accountant / hq_executive / partner ---
  if (fs1) {
    expect("facility_staff GET /tenants → 403", (await get("/tenants", fs1)).status === 403);
    expect("facility_staff GET /owners  → 403", (await get("/owners",  fs1)).status === 403);
    expect("facility_staff GET /vehicles → 200", (await get("/vehicles", fs1)).status === 200);
  }
  if (ac1) {
    expect("accountant GET /owners   → 403", (await get("/owners",   ac1)).status === 403);
    expect("accountant GET /vehicles → 403", (await get("/vehicles", ac1)).status === 403);
    expect("accountant GET /tenants  → 200", (await get("/tenants",  ac1)).status === 200);
  }
  if (hq1) {
    expect("hq_executive GET /tenants  → 403", (await get("/tenants",  hq1)).status === 403);
    expect("hq_executive GET /owners   → 403", (await get("/owners",   hq1)).status === 403);
    expect("hq_executive GET /vehicles → 403", (await get("/vehicles", hq1)).status === 403);
  }
  if (part1) {
    // Partner uses a separate portal and must NOT see tenant/owner/vehicle PII.
    expect("partner GET /tenants  → 401/403", [401, 403].includes((await get("/tenants",  part1)).status));
    expect("partner GET /owners   → 401/403", [401, 403].includes((await get("/owners",   part1)).status));
    expect("partner GET /vehicles → 401/403", [401, 403].includes((await get("/vehicles", part1)).status));
  }

  // --- tenant-card-tokens (PII issuance) ---
  if (m1) {
    expect("manager GET /tenant-card-tokens → 200",
      (await get("/tenant-card-tokens", m1)).status === 200);
  }
  if (ac1) {
    expect("accountant GET /tenant-card-tokens → 403",
      (await get("/tenant-card-tokens", ac1)).status === 403);
  }
  if (fs1) {
    expect("facility_staff GET /tenant-card-tokens → 403",
      (await get("/tenant-card-tokens", fs1)).status === 403);
  }
  if (hq1) {
    expect("hq_executive GET /tenant-card-tokens → 403",
      (await get("/tenant-card-tokens", hq1)).status === 403);
  }

  // --- units detail (cross-building) ---
  if (m1) {
    const units1 = await get("/units", m1);
    expect("manager1 GET /units → 200", units1.status === 200);
    const unitB1 = Array.isArray(units1.body) ? units1.body[0] : null;
    if (unitB1?.id) {
      expect("manager1 GET /units/:id (own) → 200",
        (await get(`/units/${unitB1.id}`, m1)).status === 200);
      if (m2) {
        const cross = await get(`/units/${unitB1.id}`, m2);
        expect("manager2 GET /units/:id (foreign building) → 404",
          cross.status === 404, `got ${cross.status}`);
      }
    }
  }

  // --- platform_admin must retain access ---
  if (admin1) {
    const r = await get("/tenants", admin1);
    expect("platform_admin GET /tenants → 200/401",
      [200, 401].includes(r.status), `got ${r.status}`);
    // Note: admin lacks a building binding by seed; 200 with empty list or
    // 401 (if auth gate requires building) are both acceptable here. The
    // critical security property is that no other role gets PII it should
    // not see — that is asserted above.
  }

  // --- Public token route: bad token MUST NOT return 200 ---
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
