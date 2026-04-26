import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isContractInRenewalReviewWindow,
  isRenewalReviewActive,
  isRenewalReviewCandidateStatus,
  RENEWAL_REVIEW_WINDOW_START_DAYS,
  RENEWAL_REVIEW_WINDOW_END_DAYS,
} from "@workspace/shared/contract-renewal";

function dayOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

test("renewal candidate status whitelist", () => {
  for (const s of ["active", "in_progress", "renewal_due"]) {
    assert.equal(isRenewalReviewCandidateStatus(s), true, `expected ${s} candidate`);
  }
  for (const s of ["draft", "in_approval", "completed", "terminated", null, undefined, ""]) {
    assert.equal(isRenewalReviewCandidateStatus(s), false, `expected ${s} non-candidate`);
  }
});

test("renewal-active date window 90 inclusive, 60 exclusive", () => {
  assert.equal(isRenewalReviewActive(dayOffset(91)), false, "91 days out -> too far");
  assert.equal(isRenewalReviewActive(dayOffset(RENEWAL_REVIEW_WINDOW_START_DAYS)), true, "exactly 90 -> in");
  assert.equal(isRenewalReviewActive(dayOffset(75)), true, "75 days -> in");
  assert.equal(isRenewalReviewActive(dayOffset(RENEWAL_REVIEW_WINDOW_END_DAYS + 1)), true, "61 days -> in");
  assert.equal(isRenewalReviewActive(dayOffset(RENEWAL_REVIEW_WINDOW_END_DAYS)), false, "exactly 60 -> out");
  assert.equal(isRenewalReviewActive(dayOffset(45)), false, "45 days -> too close");
  assert.equal(isRenewalReviewActive(dayOffset(-5)), false, "expired -> out");
  assert.equal(isRenewalReviewActive(null), false);
  assert.equal(isRenewalReviewActive(undefined), false);
});

test("contract-in-window requires both status AND date", () => {
  const inWindow = dayOffset(75);
  const outOfWindow = dayOffset(50);
  assert.equal(
    isContractInRenewalReviewWindow({ status: "active", endDate: inWindow }),
    true,
    "active+in-window -> true",
  );
  assert.equal(
    isContractInRenewalReviewWindow({ status: "in_progress", endDate: inWindow }),
    true,
    "in_progress+in-window -> true",
  );
  assert.equal(
    isContractInRenewalReviewWindow({ status: "renewal_due", endDate: inWindow }),
    true,
    "renewal_due+in-window -> true (server transitioned but still in window)",
  );
  assert.equal(
    isContractInRenewalReviewWindow({ status: "renewal_due", endDate: outOfWindow }),
    false,
    "renewal_due+out-of-window -> false (auto-disappear at <=60d)",
  );
  assert.equal(
    isContractInRenewalReviewWindow({ status: "draft", endDate: inWindow }),
    false,
    "draft never qualifies (not yet 체결)",
  );
  assert.equal(
    isContractInRenewalReviewWindow({ status: "in_approval", endDate: inWindow }),
    false,
    "in_approval never qualifies",
  );
  assert.equal(
    isContractInRenewalReviewWindow({ status: "completed", endDate: inWindow }),
    false,
    "completed never qualifies",
  );
  assert.equal(
    isContractInRenewalReviewWindow({ status: "terminated", endDate: inWindow }),
    false,
    "terminated never qualifies",
  );
  assert.equal(
    isContractInRenewalReviewWindow({ status: "active", endDate: null }),
    false,
    "no end date -> false",
  );
});
