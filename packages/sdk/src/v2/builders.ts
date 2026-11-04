// Instruction builders for each v2 action, from decoded state. They return instructions only;
// the caller signs and sends them to the right runtime:
//   base layer: create, sponsor, join + delegate, cancel, settle, refund_stale, close
//   ER (erConnection(pot.validator)): trade, finalize
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { BN, Program } from "@anchor-lang/core";
import {
  cancelMatchAccounts,
  closeMatchAccounts,
  createMatchAccounts,
  delegateMatchAccounts,
  finalizeFeeds,
  finalizeMatchAccounts,
  joinMatchAccounts,
  refundStaleAccounts,
  settleAccounts,
  sponsorMatchAccounts,
  tradeAccounts,
} from "./accounts";
import type { Arena, Pot } from "./decode";
import type { RugRoyaleV2 } from "./idl";

type P = Program<RugRoyaleV2>;
const bn = (v: bigint) => new BN(v.toString());

export interface CreateMatchInput {
  creator: PublicKey;
  arenaId: number;
  nonce: bigint;
  windowSecs: number;
  entryLamports: bigint;
  joinDeadline: bigint;
  /** Browser-held session key for the creator's seat (null = wallet-only). */
  sessionKey: PublicKey | null;
  /** ER region validator (D6: the creator's nearest region). */
  validator: PublicKey;
  allowedOpponent?: PublicKey | null;
}

export async function createMatchIx(program: P, i: CreateMatchInput) {
  const { matchAccount, pot, accounts } = createMatchAccounts({
    programId: program.programId,
    creator: i.creator,
    arenaId: i.arenaId,
    nonce: i.nonce,
  });
  const ix = await program.methods
    .createMatch(i.arenaId, {
      nonce: bn(i.nonce),
      windowSecs: i.windowSecs,
      entryLamports: bn(i.entryLamports),
      allowedOpponent: i.allowedOpponent ?? PublicKey.default,
      joinDeadline: bn(i.joinDeadline),
      sessionKey: i.sessionKey ?? PublicKey.default,
      validator: i.validator,
    })
    .accountsStrict(accounts)
    .instruction();
  return { ix, matchAccount, pot };
}

export async function sponsorMatchIx(
  program: P,
  i: { sponsor: PublicKey; pot: PublicKey; amount: bigint }
) {
  return program.methods
    .sponsorMatch(bn(i.amount))
    .accountsStrict(
      sponsorMatchAccounts({ programId: program.programId, ...i })
    )
    .instruction();
}

/** join_match + delegate_match: send both in ONE opponent-signed transaction (one approval). */
export async function joinAndDelegateIxs(
  program: P,
  i: {
    opponent: PublicKey;
    pot: Pot;
    potAddress: PublicKey;
    sessionKey: PublicKey | null;
  }
): Promise<TransactionInstruction[]> {
  const join = await program.methods
    .joinMatch(i.sessionKey ?? PublicKey.default)
    .accountsStrict(
      joinMatchAccounts({
        programId: program.programId,
        opponent: i.opponent,
        creator: i.pot.creator,
        matchAccount: i.pot.matchAccount,
        pot: i.potAddress,
        arenaId: i.pot.arenaId,
      })
    )
    .instruction();
  const delegate = await program.methods
    .delegateMatch()
    .accountsStrict(
      delegateMatchAccounts({
        programId: program.programId,
        payer: i.opponent,
        matchAccount: i.pot.matchAccount,
      })
    )
    .instruction();
  return [join, delegate];
}

/** trade, for the match's ER. `signer`: the seat's session key (or wallet). */
export async function tradeIx(
  program: P,
  i: {
    signer: PublicKey;
    matchAccount: PublicKey;
    arena: Arena;
    assetIndex: number;
    side: "buy" | "sell";
    amount: bigint;
    limitPrice: bigint;
  }
) {
  return program.methods
    .trade(
      i.assetIndex,
      i.side === "buy" ? { buy: {} } : { sell: {} },
      bn(i.amount),
      bn(i.limitPrice)
    )
    .accountsStrict(
      tradeAccounts({
        programId: program.programId,
        signer: i.signer,
        matchAccount: i.matchAccount,
        arenaId: i.arena.arenaId,
        priceFeed: i.arena.assets[i.assetIndex].feed,
      })
    )
    .instruction();
}

/** finalize_match, for the match's ER, with the arena's feeds as remaining accounts. */
export async function finalizeMatchIx(
  program: P,
  i: { payer: PublicKey; matchAccount: PublicKey; arena: Arena }
) {
  return program.methods
    .finalizeMatch()
    .accountsStrict(
      finalizeMatchAccounts({
        programId: program.programId,
        payer: i.payer,
        matchAccount: i.matchAccount,
        arenaId: i.arena.arenaId,
      })
    )
    .remainingAccounts(finalizeFeeds(i.arena.assets.map((a) => a.feed)))
    .instruction();
}

export async function settleIx(
  program: P,
  i: { settler: PublicKey; pot: Pot; treasury: PublicKey }
) {
  if (!i.pot.opponent) throw new Error("settle: pot has no opponent");
  return program.methods
    .settle()
    .accountsStrict(
      settleAccounts({
        programId: program.programId,
        settler: i.settler,
        matchAccount: i.pot.matchAccount,
        creator: i.pot.creator,
        opponent: i.pot.opponent,
        treasury: i.treasury,
      })
    )
    .instruction();
}

export async function cancelMatchIx(
  program: P,
  i: { caller: PublicKey; pot: Pot; potAddress: PublicKey; treasury: PublicKey }
) {
  return program.methods
    .cancelMatch()
    .accountsStrict(
      cancelMatchAccounts({
        programId: program.programId,
        caller: i.caller,
        pot: i.potAddress,
        creator: i.pot.creator,
        sponsor: i.pot.sponsor,
        treasury: i.treasury,
      })
    )
    .instruction();
}

export async function refundStaleIx(
  program: P,
  i: { caller: PublicKey; pot: Pot; potAddress: PublicKey; treasury: PublicKey }
) {
  if (!i.pot.opponent) throw new Error("refund_stale: pot has no opponent");
  return program.methods
    .refundStale()
    .accountsStrict(
      refundStaleAccounts({
        programId: program.programId,
        caller: i.caller,
        pot: i.potAddress,
        creator: i.pot.creator,
        opponent: i.pot.opponent,
        sponsor: i.pot.sponsor,
        treasury: i.treasury,
      })
    )
    .instruction();
}

export async function closeMatchIx(
  program: P,
  i: { caller: PublicKey; pot: Pot }
) {
  return program.methods
    .closeMatch()
    .accountsStrict(
      closeMatchAccounts({
        programId: program.programId,
        caller: i.caller,
        matchAccount: i.pot.matchAccount,
        creator: i.pot.creator,
      })
    )
    .instruction();
}
