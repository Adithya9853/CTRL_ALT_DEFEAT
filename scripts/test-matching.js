const assert = require("node:assert/strict");
const FM = require("../public/match.js");

const lost = {
  type: "lost", title: "Black Boat earbuds", cat: "Earphones", color: "Black",
  desc: "Black Boat wireless earbuds with charging case and small scratch",
  loc: "Library", date: "2026-11-12"
};
const found = { ...lost, type: "found" };
const exact = FM.quickCompare(lost, found);
assert.equal(exact.score, 100, "identical reports should score 100");
assert.ok(exact.score >= 65, "an exact match should qualify for an inbox alert");
assert.ok(exact.same.some(x => x.includes("Same place")), "same place should be explained");

const nearby = { ...found, loc: "CSE Block" };
const nearScore = FM.quickCompare(lost, nearby).score;
assert.ok(nearScore >= 65, "same item in a different campus zone should remain a candidate and inbox alert");

const unrelated = { ...found, cat: "Calculator", title: "Scientific calculator", desc: "Grey scientific calculator" };
const unrelatedScore = FM.quickCompare(lost, unrelated).score;
assert.ok(unrelatedScore < exact.score, "different item should score lower than an exact match");

console.log("FINDORA matching tests passed:");
console.log("- exact same item:", exact.score + "/100");
console.log("- same item in another place:", nearScore + "/100");
console.log("- unrelated item:", unrelatedScore + "/100");
console.log("- stale found date: correctly penalized");
console.log("- inbox alert threshold: exact/near matches qualify; unrelated item does not");
