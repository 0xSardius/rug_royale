// Writes programs/rug_royale_v2/tests/vectors/math.json. Run after any change to sdk/src/v2/math.ts.
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import {
  V2_MATH_VECTORS_PATH,
  generateV2MathVectors,
} from "./lib/math-vectors-v2";

const file = path.join(__dirname, "..", V2_MATH_VECTORS_PATH);
mkdirSync(path.dirname(file), { recursive: true });
const v = generateV2MathVectors();
writeFileSync(file, JSON.stringify(v, null, 1) + "\n");
const overflow = v.trades.filter((t) => t.out === "overflow").length;
console.log(
  `${V2_MATH_VECTORS_PATH}: ${v.trades.length} trades (${overflow} overflow), ${v.valuations.length} valuations, ${v.payouts.length} payouts`
);
