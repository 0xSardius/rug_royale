import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { v2 } from "@rug-royale/sdk";
import {
  SOLANA_ARENA,
  ArenaArgs,
  asset,
  assetSlots,
  createArena,
  defaultArenaArgs,
  defaultProtocolArgs,
  expectError,
  expectOk,
  fetchArena,
  fetchProtocol,
  initProtocol,
  newTreasury,
  newWallet,
  setupAdmin,
  updateArena,
  updateProtocol,
  v2Ctx,
  v2Events,
} from "./fixtures";

// v2 PRD §6.1.
describe("v2 admin", () => {
  async function fresh() {
    const ctx = v2Ctx();
    const admin = await newWallet(ctx, 50);
    const treasury = await newTreasury(ctx);
    return { ctx, admin, treasury };
  }

  describe("init_protocol", () => {
    it("writes every field (admin = signer) and emits ProtocolUpdated", async () => {
      const { ctx, admin, treasury } = await fresh();
      const res = await initProtocol(ctx, admin, treasury);
      expectOk(res);
      console.log(`      init_protocol CU: ${res.cu}`);
      const p = await fetchProtocol(ctx);
      expect(p.admin.equals(admin.publicKey)).to.equal(true);
      expect(p.treasury.equals(treasury)).to.equal(true);
      expect(p.matchFeeLamports.toString()).to.equal("3010000");
      expect([p.maxRakeBps, p.paused]).to.deep.equal([1000, false]);
      expect(p.bump).to.be.greaterThan(0);
      const ev = v2Events(res).find((e) => e.name === "protocolUpdated");
      expect(ev?.data.admin.equals(admin.publicKey)).to.equal(true);
    });

    it("can only be initialized once", async () => {
      const { ctx, admin, treasury } = await fresh();
      expectOk(await initProtocol(ctx, admin, treasury));
      expect((await initProtocol(ctx, admin, treasury)).ok).to.equal(false);
    });

    describe("front-run protection (H1)", () => {
      it("Unauthorized for a signer who is not the upgrade authority", async () => {
        const { ctx, admin, treasury } = await fresh();
        const attacker = await newWallet(ctx);
        expectError(
          await initProtocol(ctx, attacker, treasury, undefined, {
            upgradeAuthority: admin.publicKey,
          }),
          "Unauthorized"
        );
        expectOk(await initProtocol(ctx, admin, treasury));
      });

      it("Unauthorized once the program is immutable", async () => {
        const { ctx, admin, treasury } = await fresh();
        expectError(
          await initProtocol(ctx, admin, treasury, undefined, {
            upgradeAuthority: null,
          }),
          "Unauthorized"
        );
      });

      it("Unauthorized runs before the argument checks", async () => {
        const { ctx, admin, treasury } = await fresh();
        const attacker = await newWallet(ctx);
        expectError(
          await initProtocol(
            ctx,
            attacker,
            treasury,
            defaultProtocolArgs({ maxRakeBps: 1001 }),
            {
              upgradeAuthority: admin.publicKey,
            }
          ),
          "Unauthorized"
        );
      });
    });

    describe("typed errors, in PRD order", () => {
      it("RakeTooHigh above 10%", async () => {
        const { ctx, admin, treasury } = await fresh();
        expectError(
          await initProtocol(
            ctx,
            admin,
            treasury,
            defaultProtocolArgs({ maxRakeBps: 1001 })
          ),
          "RakeTooHigh"
        );
      });
      it("TipTooHigh above 0.01 SOL (L4)", async () => {
        const { ctx, admin, treasury } = await fresh();
        expectError(
          await initProtocol(
            ctx,
            admin,
            treasury,
            defaultProtocolArgs({ settlerTipLamports: new BN(10_000_001) })
          ),
          "TipTooHigh"
        );
      });
      for (const [label, make] of [
        ["unfunded wallet", async () => Keypair.generate().publicKey],
        ["Pubkey::default (System Program)", async () => PublicKey.default],
        ["program-owned account", async () => v2.PROGRAM_ID],
      ] as [string, () => Promise<PublicKey>][]) {
        it(`InvalidTreasury: ${label}`, async () => {
          const { ctx, admin } = await fresh();
          expectError(
            await initProtocol(ctx, admin, await make()),
            "InvalidTreasury"
          );
        });
      }
      it("the first failing check wins", async () => {
        const { ctx, admin } = await fresh();
        const bad = Keypair.generate().publicKey;
        const both = defaultProtocolArgs({
          maxRakeBps: 1001,
          settlerTipLamports: new BN(10_000_001),
        });
        expectError(await initProtocol(ctx, admin, bad, both), "RakeTooHigh");
        expectError(
          await initProtocol(
            ctx,
            admin,
            bad,
            defaultProtocolArgs({ settlerTipLamports: new BN(10_000_001) })
          ),
          "TipTooHigh"
        );
        expectError(await initProtocol(ctx, admin, bad), "InvalidTreasury");
      });
    });
  });

  describe("update_protocol", () => {
    async function ready() {
      const ctx = v2Ctx();
      const { admin, treasury } = await setupAdmin(ctx);
      return { ctx, admin, treasury };
    }

    it("updates values and treasury", async () => {
      const { ctx, admin } = await ready();
      const t2 = await newTreasury(ctx);
      const res = await updateProtocol(
        ctx,
        admin,
        t2,
        admin.publicKey,
        defaultProtocolArgs({ maxEntryLamports: new BN(0), paused: true })
      );
      expectOk(res);
      const p = await fetchProtocol(ctx);
      expect(p.treasury.equals(t2)).to.equal(true);
      expect([p.maxEntryLamports.toString(), p.paused]).to.deep.equal([
        "0",
        true,
      ]);
      expect(v2Events(res).some((e) => e.name === "protocolUpdated")).to.equal(
        true
      );
    });

    it("admin rotation: the new admin can update, the old one cannot", async () => {
      const { ctx, admin, treasury } = await ready();
      const squads = await newWallet(ctx);
      expectOk(await updateProtocol(ctx, admin, treasury, squads.publicKey));
      expect(
        (await fetchProtocol(ctx)).admin.equals(squads.publicKey)
      ).to.equal(true);
      expectError(
        await updateProtocol(ctx, admin, treasury, admin.publicKey),
        "Unauthorized"
      );
      expectOk(await updateProtocol(ctx, squads, treasury, squads.publicKey));
    });

    it("Unauthorized for a non-admin", async () => {
      const { ctx, treasury } = await ready();
      const rando = await newWallet(ctx);
      expectError(
        await updateProtocol(ctx, rando, treasury, rando.publicKey),
        "Unauthorized"
      );
    });

    it("Unauthorized when the new admin is Pubkey::default (would brick admin)", async () => {
      const { ctx, admin, treasury } = await ready();
      expectError(
        await updateProtocol(ctx, admin, treasury, PublicKey.default),
        "Unauthorized"
      );
    });

    it("runs the same value checks as init, in order", async () => {
      const { ctx, admin, treasury } = await ready();
      const me = admin.publicKey;
      expectError(
        await updateProtocol(
          ctx,
          admin,
          treasury,
          me,
          defaultProtocolArgs({ maxRakeBps: 1001 })
        ),
        "RakeTooHigh"
      );
      expectError(
        await updateProtocol(
          ctx,
          admin,
          treasury,
          me,
          defaultProtocolArgs({ settlerTipLamports: new BN(10_000_001) })
        ),
        "TipTooHigh"
      );
      expectError(
        await updateProtocol(ctx, admin, Keypair.generate().publicKey, me),
        "InvalidTreasury"
      );
    });
  });

  describe("create_arena", () => {
    async function ready() {
      const { ctx, admin, treasury } = await fresh();
      expectOk(await initProtocol(ctx, admin, treasury));
      return { ctx, admin };
    }

    it("writes the arena (mode LIVE_PRICE_DUEL) and emits ArenaUpdated", async () => {
      const { ctx, admin } = await ready();
      const res = await createArena(ctx, admin, 1);
      expectOk(res);
      console.log(`      create_arena CU: ${res.cu}`);
      const a = await fetchArena(ctx, 1);
      expect([
        a.arenaId,
        a.mode,
        a.assetCount,
        a.startDelaySecs,
        a.freerollDailyCap,
      ]).to.deep.equal([1, 0, 10, 20, 3]);
      expect(a.assets[5].exponent).to.equal(10); // BONK
      expect(a.assets[0].feed.toBase58()).to.equal(
        "ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu"
      ); // SOL, spike 01
      expect(a.windows).to.deep.equal([300, 900, 3600, 0]);
      expect(
        v2Events(res).find((e) => e.name === "arenaUpdated")?.data.arenaId
      ).to.equal(1);
    });

    it("a free-only arena (min = max = 0) is valid", async () => {
      const { ctx, admin } = await ready();
      expectOk(
        await createArena(
          ctx,
          admin,
          2,
          defaultArenaArgs({
            minEntryLamports: new BN(0),
            maxEntryLamports: new BN(0),
          })
        )
      );
    });

    it("the same arena id cannot be created twice", async () => {
      const { ctx, admin } = await ready();
      expectOk(await createArena(ctx, admin, 1));
      expect((await createArena(ctx, admin, 1)).ok).to.equal(false);
    });

    it("Unauthorized for a non-admin", async () => {
      const { ctx } = await ready();
      expectError(
        await createArena(ctx, await newWallet(ctx), 1),
        "Unauthorized"
      );
    });

    const sol = asset(6, 8);
    const cases: [string, Partial<ArenaArgs>][] = [
      ["InvalidAssetList", { assetCount: 0, assets: assetSlots([]) }],
      ["InvalidAssetList", { assetCount: 11 }],
      [
        "InvalidAssetList",
        {
          assetCount: 2,
          assets: assetSlots([sol, { ...sol, feed: PublicKey.default }]),
        },
      ],
      ["InvalidAssetList", { assetCount: 2, assets: assetSlots([sol, sol]) }],
      [
        "InvalidAssetList",
        { assetCount: 1, assets: assetSlots([{ ...sol, exponent: 19 }]) },
      ],
      [
        "InvalidAssetList",
        { assetCount: 1, assets: assetSlots([sol, asset(92, 8)]) },
      ],
      ["InvalidWindowSet", { windows: [0, 300, 900, 0] }],
      ["InvalidWindowSet", { windows: [300, 300, 0, 0] }],
      ["InvalidWindowSet", { windows: [900, 300, 0, 0] }],
      ["InvalidWindowSet", { windows: [300, 0, 900, 0] }],
      ["InvalidBankroll", { bankroll: new BN(0) }],
      ["InvalidStartDelay", { startDelaySecs: 4 }],
      ["InvalidStartDelay", { startDelaySecs: 121 }],
      ["FeeTooHigh", { tradeFeeBps: 1001 }],
      ["RakeTooHigh", { rakeBps: 1001 }],
      ["InvalidEntryRange", { minEntryLamports: new BN(3_010_000) }], // min must exceed the match fee
      [
        "InvalidEntryRange",
        {
          minEntryLamports: new BN(20_000_000),
          maxEntryLamports: new BN(10_000_000),
        },
      ],
      ["InvalidEntryRange", { maxEntryLamports: new BN(1_000_000_001) }],
      ["InvalidEntryRange", { minEntryLamports: new BN(0) }], // free min with a paid max
    ];
    cases.forEach(([name, o], i) => {
      it(`${name} (case ${i + 1})`, async () => {
        const { ctx, admin } = await ready();
        expectError(
          await createArena(ctx, admin, 1, defaultArenaArgs(o)),
          name
        );
      });
    });

    it("RakeTooHigh against the protocol's cap, not just 10%", async () => {
      const { ctx, admin, treasury } = await fresh();
      expectOk(
        await initProtocol(
          ctx,
          admin,
          treasury,
          defaultProtocolArgs({ maxRakeBps: 300 })
        )
      );
      expectError(
        await createArena(ctx, admin, 1, defaultArenaArgs({ rakeBps: 301 })),
        "RakeTooHigh"
      );
      expectOk(
        await createArena(ctx, admin, 1, defaultArenaArgs({ rakeBps: 300 }))
      );
    });

    it("the first failing check wins", async () => {
      const { ctx, admin } = await ready();
      const all: Partial<ArenaArgs> = {
        assetCount: 0,
        assets: assetSlots([]),
        windows: [0, 0, 0, 0],
        bankroll: new BN(0),
        startDelaySecs: 0,
        tradeFeeBps: 1001,
        rakeBps: 1001,
        minEntryLamports: new BN(1),
      };
      const order = [
        "InvalidAssetList",
        "InvalidWindowSet",
        "InvalidBankroll",
        "InvalidStartDelay",
        "FeeTooHigh",
        "RakeTooHigh",
        "InvalidEntryRange",
      ];
      const fixes: Partial<ArenaArgs>[] = [
        { assetCount: 10, assets: defaultArenaArgs().assets },
        { windows: [300, 0, 0, 0] },
        { bankroll: new BN(1) },
        { startDelaySecs: 20 },
        { tradeFeeBps: 10 },
        { rakeBps: 500 },
      ];
      let args = defaultArenaArgs(all);
      for (let i = 0; i < order.length; i++) {
        expectError(await createArena(ctx, admin, 1, args), order[i]);
        if (fixes[i]) args = { ...args, ...fixes[i] };
      }
    });
  });

  describe("update_arena", () => {
    async function ready() {
      const ctx = v2Ctx();
      const { admin, treasury } = await setupAdmin(ctx);
      return { ctx, admin, treasury };
    }

    it("can disable an asset and change windows, fees and pause", async () => {
      const { ctx, admin } = await ready();
      const keep = defaultArenaArgs().assets.map((a, i) =>
        i === 5 ? { ...a, enabled: false } : a
      );
      const res = await updateArena(
        ctx,
        admin,
        1,
        defaultArenaArgs({
          assets: keep,
          windows: [300, 900, 0, 0],
          tradeFeeBps: 20,
          paused: true,
        })
      );
      expectOk(res);
      const a = await fetchArena(ctx, 1);
      expect([a.assets[5].enabled, a.tradeFeeBps, a.paused]).to.deep.equal([
        false,
        20,
        true,
      ]);
      expect(a.windows).to.deep.equal([300, 900, 0, 0]);
      expect(v2Events(res).some((e) => e.name === "arenaUpdated")).to.equal(
        true
      );
    });

    it("appending new asset indices is allowed", async () => {
      const ctx = v2Ctx();
      const { admin } = await setupAdmin(ctx);
      // Arena 2 starts with 3 assets, then grows to 4.
      const three = SOLANA_ARENA.slice(0, 3).map(([, id, e]) => asset(id, e));
      expectOk(
        await createArena(
          ctx,
          admin,
          2,
          defaultArenaArgs({ assetCount: 3, assets: assetSlots(three) })
        )
      );
      expectOk(
        await updateArena(
          ctx,
          admin,
          2,
          defaultArenaArgs({
            assetCount: 4,
            assets: assetSlots([...three, asset(182, 8)]),
          })
        )
      );
      expect((await fetchArena(ctx, 2)).assetCount).to.equal(4);
    });

    describe("existing asset indices are immutable (live matches stay valid)", () => {
      const base = () => defaultArenaArgs().assets;
      const mutate: [
        string,
        (a: ReturnType<typeof base>) => Partial<ArenaArgs>
      ][] = [
        [
          "feed changed",
          (a) => ({ assets: a.map((x, i) => (i === 0 ? asset(2, 8) : x)) }),
        ],
        [
          "exponent changed",
          (a) => ({
            assets: a.map((x, i) => (i === 5 ? { ...x, exponent: 8 } : x)),
          }),
        ],
        [
          "lazer id changed",
          (a) => ({
            assets: a.map((x, i) => (i === 1 ? { ...x, lazerId: 999 } : x)),
          }),
        ],
        [
          "asset removed",
          (a) => ({ assetCount: 9, assets: assetSlots(a.slice(0, 9)) }),
        ],
      ];
      mutate.forEach(([label, f]) => {
        it(`InvalidAssetList: ${label}`, async () => {
          const { ctx, admin } = await ready();
          expectError(
            await updateArena(ctx, admin, 1, defaultArenaArgs(f(base()))),
            "InvalidAssetList"
          );
        });
      });
    });

    it("Unauthorized for a non-admin, and for the old admin after rotation", async () => {
      const { ctx, admin, treasury } = await ready();
      expectError(
        await updateArena(ctx, await newWallet(ctx), 1, defaultArenaArgs()),
        "Unauthorized"
      );
      const squads = await newWallet(ctx);
      expectOk(await updateProtocol(ctx, admin, treasury, squads.publicKey));
      expectError(
        await updateArena(ctx, admin, 1, defaultArenaArgs()),
        "Unauthorized"
      );
      expectOk(await updateArena(ctx, squads, 1, defaultArenaArgs()));
    });

    it("runs the same value checks as create", async () => {
      const { ctx, admin } = await ready();
      expectError(
        await updateArena(
          ctx,
          admin,
          1,
          defaultArenaArgs({ windows: [0, 0, 0, 0] })
        ),
        "InvalidWindowSet"
      );
      expectError(
        await updateArena(ctx, admin, 1, defaultArenaArgs({ rakeBps: 1001 })),
        "RakeTooHigh"
      );
    });
  });
});
