import assert from "node:assert/strict";
import test from "node:test";
import { decidePaymentAction } from "../src/risk_decision.js";

test("releases an ordinary payment receipt", () => {
  assert.equal(decidePaymentAction(12_500, 24), "release_receipt");
});

test("holds a high-risk payment for manual review", () => {
  assert.equal(decidePaymentAction(12_500, 70), "manual_review");
});

test("holds a high-value payment even with a low score", () => {
  assert.equal(decidePaymentAction(500_000, 10), "manual_review");
});
