// Event parsing from transaction logs. Events are notifications only (RT-7); the chart
// backfill uses SwapExecuted because it carries post-trade reserves (PRD §11).
import { PublicKey } from "@solana/web3.js";
import { EventParser } from "@anchor-lang/core";
import { bnToBigInt } from "./decode";
import { coder, PROGRAM_ID } from "./idl";

export interface SwapEvent {
  duel: PublicKey;
  player: PublicKey;
  side: "buy" | "sell";
  amountIn: bigint;
  amountOut: bigint;
  quoteReserve: bigint;
  tokenReserve: bigint;
}

/** All program events in a transaction's logs, as Anchor decodes them. */
export function parseEvents(logs: string[], programId: PublicKey = PROGRAM_ID) {
  return [...new EventParser(programId, coder).parseLogs(logs)];
}

export function parseSwapEvents(
  logs: string[],
  programId: PublicKey = PROGRAM_ID
): SwapEvent[] {
  return parseEvents(logs, programId)
    .filter((e) => e.name === "swapExecuted")
    .map(({ data: d }) => ({
      duel: d.duel,
      player: d.player,
      side: "buy" in d.side ? "buy" : "sell",
      amountIn: bnToBigInt(d.amountIn),
      amountOut: bnToBigInt(d.amountOut),
      quoteReserve: bnToBigInt(d.quoteReserve),
      tokenReserve: bnToBigInt(d.tokenReserve),
    }));
}
