export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
export const CLUSTER = "devnet";

export const explorerUrl = (kind: "address" | "tx", id: string) =>
  `https://explorer.solana.com/${kind}/${id}?cluster=${CLUSTER}`;

/** create_duel's account inits exceed the 200k default (PRD §6.2). */
export const CREATE_DUEL_CU = 400_000;
