// v2 event parsing from transaction logs (base layer and ER). Events are notifications only;
// the app reads state from accounts. `Traded` and `MatchFinalized` are emitted in the ER, so
// the client reads them from its own ER transaction result.
import { PublicKey } from "@solana/web3.js";
import { EventParser } from "@anchor-lang/core";
import { bnToBigInt as big } from "../decode";
import { coder, PROGRAM_ID } from "./idl";

/** All v2 program events in a transaction's logs, as Anchor decodes them. */
export function parseEvents(logs: string[], programId: PublicKey = PROGRAM_ID) {
  return [...new EventParser(programId, coder).parseLogs(logs)];
}

export interface TradedEvent {
  matchAccount: PublicKey;
  seat: 0 | 1;
  assetIndex: number;
  side: "buy" | "sell";
  /** Buy: micro-USD in; sell: quantity in. */
  amountIn: bigint;
  /** Buy: quantity out; sell: micro-USD out after the fee. */
  amountOut: bigint;
  /** Raw oracle price used (scale by the arena asset's exponent). */
  price: bigint;
  publishTime: bigint;
}

export function parseTradedEvents(
  logs: string[],
  programId: PublicKey = PROGRAM_ID
): TradedEvent[] {
  return parseEvents(logs, programId)
    .filter((e) => e.name === "traded")
    .map(({ data: d }) => ({
      matchAccount: d.matchAccount,
      seat: d.seat as 0 | 1,
      assetIndex: d.assetIndex,
      side: d.side === 0 ? "buy" : "sell",
      amountIn: big(d.amountIn),
      amountOut: big(d.amountOut),
      price: big(d.price),
      publishTime: big(d.publishTime),
    }));
}

export interface FinalizedEvent {
  matchAccount: PublicKey;
  result: number;
  finalValues: [bigint, bigint];
  markPublishTime: bigint;
}

export function parseFinalizedEvent(
  logs: string[],
  programId: PublicKey = PROGRAM_ID
): FinalizedEvent | null {
  const e = parseEvents(logs, programId).find(
    (x) => x.name === "matchFinalized"
  );
  if (!e) return null;
  const d = e.data;
  return {
    matchAccount: d.matchAccount,
    result: d.result,
    finalValues: [big(d.finalValues[0]), big(d.finalValues[1])],
    markPublishTime: big(d.markPublishTime),
  };
}

export interface SettledEvent {
  matchAccount: PublicKey;
  result: number;
  finalValues: [bigint, bigint];
  prize: bigint;
  rake: bigint;
  matchFee: bigint;
  tip: bigint;
}

export function parseSettledEvent(
  logs: string[],
  programId: PublicKey = PROGRAM_ID
): SettledEvent | null {
  const e = parseEvents(logs, programId).find((x) => x.name === "matchSettled");
  if (!e) return null;
  const d = e.data;
  return {
    matchAccount: d.matchAccount,
    result: d.result,
    finalValues: [big(d.finalValues[0]), big(d.finalValues[1])],
    prize: big(d.prize),
    rake: big(d.rake),
    matchFee: big(d.matchFee),
    tip: big(d.tip),
  };
}
