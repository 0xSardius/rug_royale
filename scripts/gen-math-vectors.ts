// Writes programs/rug_royale/tests/vectors/math.json. Run after any change to math.ts.
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { MATH_VECTORS_PATH, generateMathVectors } from "./lib/math-vectors";

const file = path.join(__dirname, "..", MATH_VECTORS_PATH);
mkdirSync(path.dirname(file), { recursive: true });
const v = generateMathVectors();
writeFileSync(file, JSON.stringify(v, null, 1) + "\n");
console.log(
  `${MATH_VECTORS_PATH}: ${v.swaps.length} swaps, ${v.valuations.length} valuations, ${v.results.length} results, ${v.payouts.length} payouts`
);
