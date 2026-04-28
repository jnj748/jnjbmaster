// [Task #501] /buildings/calculate-safety 의 3-상태 분류 로직 회귀 테스트.
//   - 0/누락 입력은 "확인 필요"(pending_input) 로 떨어져야 한다.
//   - 사용자가 명시적으로 "도시가스 없음"(hasGas=false) 한 케이스는 "선임 불요"(not_required) 유지.
//   - 법령 기준 미달이 분명한 케이스(예: 연면적 1만㎡ 미만 → 기계설비)는 "선임 불요" 유지.
//
// safety 라우터 자체는 미들웨어를 갖지 않는다(부모 buildings/index.ts 가
// requireRole 을 일괄 적용함). 따라서 본 테스트는 인증 없이 라우터를 직접 마운트한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const { default: safetyRouter } = await import("../routes/buildings/safety");

const app = express();
app.use(express.json());
app.use("/api", safetyRouter);

let server: Server;
let baseUrl: string;

async function startServer(): Promise<void> {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;
}

async function stopServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

interface FieldRow {
  field: string;
  required: boolean;
  status: "required" | "pending_input" | "not_required";
  pendingInputs?: string[];
  grade: string | null;
  type: string | null;
  notes: string[];
}

interface SafetyResponse {
  safetyManagerRequired: boolean;
  safetyManagerType: string | null;
  fields: FieldRow[];
}

async function calc(body: Record<string, unknown>): Promise<SafetyResponse> {
  const res = await fetch(`${baseUrl}/buildings/calculate-safety`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(res.status, 200, `expected 200, got ${res.status}`);
  return (await res.json()) as SafetyResponse;
}

function pickField(resp: SafetyResponse, name: string): FieldRow {
  const f = resp.fields.find((x) => x.field === name);
  assert.ok(f, `field ${name} must be present in response`);
  return f as FieldRow;
}

test("[Task #501-a] 11층 / 4,624㎡ / 업무시설 / 입력 미상: 전기·승강기는 pending_input, 기계설비는 not_required", async () => {
  await startServer();
  try {
    const resp = await calc({
      totalArea: "4624",
      totalFloors: "11",
      basementFloors: "1",
      totalUnits: "0",
      buildingUsage: "업무시설",
      elevatorCount: "0",
      electricCapacityKw: "0",
      gasUsageMonthly: "0",
      hasGas: "true",
    });

    const elec = pickField(resp, "electrical");
    assert.equal(elec.status, "pending_input", "electrical must be pending_input when electricCapacityKw=0");
    assert.equal(elec.required, false);
    assert.deepEqual(elec.pendingInputs, ["electricCapacityKw"]);

    const elev = pickField(resp, "elevator");
    assert.equal(elev.status, "pending_input", "elevator must be pending_input when elevatorCount=0");
    assert.equal(elev.required, false);
    assert.deepEqual(elev.pendingInputs, ["elevatorCount"]);

    const mech = pickField(resp, "mechanical");
    assert.equal(mech.status, "not_required", "mechanical must be not_required when area < 10,000㎡");
    assert.equal(mech.required, false);
    assert.equal(mech.pendingInputs, undefined);

    // 소방은 11층 → 1급 (status=required 유지)
    const fire = pickField(resp, "fire_safety");
    assert.equal(fire.status, "required");
    assert.equal(fire.required, true);
    assert.equal(fire.grade, "1급 소방안전관리자");
  } finally {
    await stopServer();
  }
});

test("[Task #501-b] hasGas=false 는 가스안전관리자가 not_required 로 유지된다 (pending_input 으로 떨어지지 않음)", async () => {
  await startServer();
  try {
    const resp = await calc({
      totalArea: "4624",
      totalFloors: "11",
      basementFloors: "1",
      totalUnits: "0",
      buildingUsage: "업무시설",
      elevatorCount: "0",
      electricCapacityKw: "0",
      gasUsageMonthly: "0",
      hasGas: false, // 사용자가 명시적으로 "도시가스 없음" 선택
    });

    const gas = pickField(resp, "gas");
    assert.equal(gas.status, "not_required", "hasGas=false ⇒ gas must remain not_required");
    assert.equal(gas.required, false);
    assert.equal(gas.pendingInputs, undefined);
  } finally {
    await stopServer();
  }
});

test("[Task #501-c] hasGas=true + gasUsageMonthly=0 은 pending_input (확인 필요) 로 분류된다", async () => {
  await startServer();
  try {
    const resp = await calc({
      totalArea: "8000",
      totalFloors: "8",
      basementFloors: "1",
      totalUnits: "0",
      buildingUsage: "업무시설",
      elevatorCount: "2",
      electricCapacityKw: "150",
      gasUsageMonthly: "0",
      hasGas: "true",
    });

    const gas = pickField(resp, "gas");
    assert.equal(gas.status, "pending_input", "hasGas=true && gasUsageMonthly=0 ⇒ pending_input");
    assert.equal(gas.required, false);
    assert.deepEqual(gas.pendingInputs, ["gasUsageMonthly"]);

    // 입력값이 들어온 전기/승강기는 정상적으로 required 로 간다.
    const elec = pickField(resp, "electrical");
    assert.equal(elec.status, "required");
    assert.equal(elec.required, true);
    const elev = pickField(resp, "elevator");
    assert.equal(elev.status, "required");
    assert.equal(elev.required, true);
  } finally {
    await stopServer();
  }
});

test("[Task #501-d] 입력값이 모두 충족된 케이스: 전기/가스/승강기 모두 required, 모든 필드에 status 가 채워진다", async () => {
  await startServer();
  try {
    const resp = await calc({
      totalArea: "20000",
      totalFloors: "15",
      basementFloors: "2",
      totalUnits: "350",
      buildingUsage: "공동주택",
      elevatorCount: "4",
      electricCapacityKw: "500",
      gasUsageMonthly: "1500",
      hasGas: "true",
    });

    // 모든 7개 필드에 status 가 존재해야 한다.
    const expected = ["electrical", "fire_safety", "gas", "mechanical", "telecom", "elevator", "disinfection"];
    for (const name of expected) {
      const f = pickField(resp, name);
      assert.ok(["required", "pending_input", "not_required"].includes(f.status), `${name}.status must be one of 3 values`);
    }

    const elec = pickField(resp, "electrical");
    assert.equal(elec.status, "required");
    const gas = pickField(resp, "gas");
    assert.equal(gas.status, "required");
    const mech = pickField(resp, "mechanical");
    assert.equal(mech.status, "required", "area=20,000㎡ ⇒ mechanical required");
    const elev = pickField(resp, "elevator");
    assert.equal(elev.status, "required");
    const disinf = pickField(resp, "disinfection");
    assert.equal(disinf.status, "required", "공동주택 350세대 ⇒ disinfection required");
  } finally {
    await stopServer();
  }
});
