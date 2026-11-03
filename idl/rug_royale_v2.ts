/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/rug_royale_v2.json`.
 */
export type RugRoyaleV2 = {
  "address": "2hcR5rib7mNkcFHnPEfjhH1yJdNsPmK6SVkU3dDjD9Cr",
  "metadata": {
    "name": "rugRoyaleV2",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Rug Royale v2: 1v1 paper-trading duels on live prices (MagicBlock ER)"
  },
  "instructions": [
    {
      "name": "createArena",
      "discriminator": [
        174,
        236,
        45,
        61,
        197,
        215,
        149,
        169
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "arena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              },
              {
                "kind": "arg",
                "path": "arenaId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "arenaId",
          "type": "u16"
        },
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "arenaArgs"
            }
          }
        }
      ]
    },
    {
      "name": "initProtocol",
      "discriminator": [
        3,
        188,
        141,
        237,
        225,
        226,
        232,
        210
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "programData",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  25,
                  66,
                  246,
                  163,
                  13,
                  39,
                  44,
                  71,
                  124,
                  78,
                  247,
                  49,
                  139,
                  219,
                  90,
                  70,
                  107,
                  26,
                  206,
                  66,
                  146,
                  5,
                  114,
                  129,
                  149,
                  225,
                  89,
                  28,
                  85,
                  80,
                  164,
                  207
                ]
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                2,
                168,
                246,
                145,
                78,
                136,
                161,
                176,
                226,
                16,
                21,
                62,
                247,
                99,
                174,
                43,
                0,
                194,
                185,
                61,
                22,
                193,
                36,
                210,
                192,
                83,
                122,
                16,
                4,
                128,
                0,
                0
              ]
            }
          }
        },
        {
          "name": "treasury"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "protocolArgs"
            }
          }
        }
      ]
    },
    {
      "name": "updateArena",
      "discriminator": [
        179,
        14,
        84,
        80,
        59,
        23,
        182,
        226
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "protocol",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "arena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "arena.arenaId",
                "account": "arena"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "arenaArgs"
            }
          }
        }
      ]
    },
    {
      "name": "updateProtocol",
      "discriminator": [
        206,
        25,
        218,
        114,
        109,
        41,
        74,
        173
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "protocol",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "treasury"
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        },
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "protocolArgs"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "arena",
      "discriminator": [
        243,
        215,
        44,
        44,
        231,
        211,
        232,
        168
      ]
    },
    {
      "name": "protocol",
      "discriminator": [
        45,
        39,
        101,
        43,
        115,
        72,
        131,
        40
      ]
    }
  ],
  "events": [
    {
      "name": "arenaUpdated",
      "discriminator": [
        38,
        87,
        53,
        48,
        142,
        173,
        225,
        21
      ]
    },
    {
      "name": "protocolUpdated",
      "discriminator": [
        52,
        35,
        157,
        26,
        20,
        117,
        63,
        218
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Signer is not authorized"
    },
    {
      "code": 6001,
      "name": "rakeTooHigh",
      "msg": "Rake exceeds the maximum"
    },
    {
      "code": 6002,
      "name": "feeTooHigh",
      "msg": "Fee exceeds the 10% maximum"
    },
    {
      "code": 6003,
      "name": "tipTooHigh",
      "msg": "Settler tip exceeds the maximum"
    },
    {
      "code": 6004,
      "name": "invalidTreasury",
      "msg": "Treasury must be a funded, rent-exempt system account"
    },
    {
      "code": 6005,
      "name": "invalidAssetList",
      "msg": "Arena asset list is invalid"
    },
    {
      "code": 6006,
      "name": "invalidWindowSet",
      "msg": "Windows must be a non-zero ascending prefix"
    },
    {
      "code": 6007,
      "name": "invalidBankroll",
      "msg": "Bankroll must be greater than zero"
    },
    {
      "code": 6008,
      "name": "invalidEntryRange",
      "msg": "Entry range is invalid"
    },
    {
      "code": 6009,
      "name": "invalidStartDelay",
      "msg": "Start delay is out of range"
    },
    {
      "code": 6010,
      "name": "paused",
      "msg": "Protocol or arena is paused"
    },
    {
      "code": 6011,
      "name": "invalidWindow",
      "msg": "Window is not one of the arena's windows"
    },
    {
      "code": 6012,
      "name": "entryOutOfRange",
      "msg": "Entry is outside the allowed range"
    },
    {
      "code": 6013,
      "name": "deadlineTooSoon",
      "msg": "Join deadline is too soon"
    },
    {
      "code": 6014,
      "name": "deadlineTooFar",
      "msg": "Join deadline is too far in the future"
    },
    {
      "code": 6015,
      "name": "cannotJoinOwnMatch",
      "msg": "Creator cannot join their own match"
    },
    {
      "code": 6016,
      "name": "invalidValidator",
      "msg": "Validator (ER region) must be set"
    },
    {
      "code": 6017,
      "name": "matchNotOpen",
      "msg": "Match is not open"
    },
    {
      "code": 6018,
      "name": "joinDeadlinePassed",
      "msg": "Join deadline has passed"
    },
    {
      "code": 6019,
      "name": "opponentNotAllowed",
      "msg": "Signer is not the allowed opponent"
    },
    {
      "code": 6020,
      "name": "freerollCapReached",
      "msg": "Daily freeroll limit reached"
    },
    {
      "code": 6021,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6022,
      "name": "sponsorMismatch",
      "msg": "Match already has a different sponsor"
    },
    {
      "code": 6023,
      "name": "sponsorTooSmall",
      "msg": "First sponsorship is below the 0.01 SOL minimum"
    },
    {
      "code": 6024,
      "name": "notAParticipant",
      "msg": "Signer is not a participant in this match"
    },
    {
      "code": 6025,
      "name": "matchNotActive",
      "msg": "Match is not active"
    },
    {
      "code": 6026,
      "name": "windowNotStarted",
      "msg": "Trading window has not started"
    },
    {
      "code": 6027,
      "name": "windowEnded",
      "msg": "Trading window has ended"
    },
    {
      "code": 6028,
      "name": "invalidAsset",
      "msg": "Asset index is out of range"
    },
    {
      "code": 6029,
      "name": "assetDisabled",
      "msg": "Asset is disabled for new buys"
    },
    {
      "code": 6030,
      "name": "wrongPriceFeed",
      "msg": "Price feed does not match the arena asset"
    },
    {
      "code": 6031,
      "name": "priceInvalid",
      "msg": "Price feed data is invalid"
    },
    {
      "code": 6032,
      "name": "priceStale",
      "msg": "Price is stale"
    },
    {
      "code": 6033,
      "name": "limitPriceExceeded",
      "msg": "Price is past the limit price"
    },
    {
      "code": 6034,
      "name": "insufficientCash",
      "msg": "Not enough cash"
    },
    {
      "code": 6035,
      "name": "insufficientQty",
      "msg": "Not enough quantity"
    },
    {
      "code": 6036,
      "name": "zeroOutput",
      "msg": "Trade output rounds to zero"
    },
    {
      "code": 6037,
      "name": "windowNotEnded",
      "msg": "Trading window has not ended"
    },
    {
      "code": 6038,
      "name": "markWindowMissed",
      "msg": "No valid mark price within the mark window"
    },
    {
      "code": 6039,
      "name": "potNotActive",
      "msg": "Pot is not active"
    },
    {
      "code": 6040,
      "name": "matchStillDelegated",
      "msg": "Match is still delegated to the ER"
    },
    {
      "code": 6041,
      "name": "matchNotFinalized",
      "msg": "Match is not finalized"
    },
    {
      "code": 6042,
      "name": "deadlineNotReached",
      "msg": "Join deadline has not been reached"
    },
    {
      "code": 6043,
      "name": "notStaleYet",
      "msg": "Refund is not available yet"
    },
    {
      "code": 6044,
      "name": "matchStillLive",
      "msg": "Match is still open or active"
    },
    {
      "code": 6045,
      "name": "mathOverflow",
      "msg": "Math overflow"
    }
  ],
  "types": [
    {
      "name": "arena",
      "docs": [
        "Seeds `[\"arena\", arena_id.to_le_bytes()]`. Base only; cloned read-only into the ER."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arenaId",
            "type": "u16"
          },
          {
            "name": "mode",
            "docs": [
              "0 = LIVE_PRICE_DUEL."
            ],
            "type": "u8"
          },
          {
            "name": "paused",
            "docs": [
              "Blocks create/join only."
            ],
            "type": "bool"
          },
          {
            "name": "assetCount",
            "docs": [
              "1..=MAX_ASSETS; entries at index >= asset_count are zeroed."
            ],
            "type": "u8"
          },
          {
            "name": "assets",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "arenaAsset"
                  }
                },
                10
              ]
            }
          },
          {
            "name": "windows",
            "docs": [
              "Seconds, a non-zero ascending prefix; 0 = unused slot."
            ],
            "type": {
              "array": [
                "u32",
                4
              ]
            }
          },
          {
            "name": "bankroll",
            "docs": [
              "Virtual bankroll per seat, micro-USD."
            ],
            "type": "u64"
          },
          {
            "name": "minEntryLamports",
            "type": "u64"
          },
          {
            "name": "maxEntryLamports",
            "type": "u64"
          },
          {
            "name": "tradeFeeBps",
            "type": "u16"
          },
          {
            "name": "rakeBps",
            "type": "u16"
          },
          {
            "name": "maxPriceAgeS",
            "type": "u32"
          },
          {
            "name": "startDelaySecs",
            "docs": [
              "Q2: delay from join to the start of trading."
            ],
            "type": "u16"
          },
          {
            "name": "freerollDailyCap",
            "docs": [
              "D4: sponsored freerolls per wallet per day."
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "arenaArgs",
      "docs": [
        "Every `Arena` field except `arena_id` (seed), `mode` (always LIVE_PRICE_DUEL in v2.1)",
        "and `bump`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "assetCount",
            "type": "u8"
          },
          {
            "name": "assets",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "arenaAsset"
                  }
                },
                10
              ]
            }
          },
          {
            "name": "windows",
            "type": {
              "array": [
                "u32",
                4
              ]
            }
          },
          {
            "name": "bankroll",
            "type": "u64"
          },
          {
            "name": "minEntryLamports",
            "type": "u64"
          },
          {
            "name": "maxEntryLamports",
            "type": "u64"
          },
          {
            "name": "tradeFeeBps",
            "type": "u16"
          },
          {
            "name": "rakeBps",
            "type": "u16"
          },
          {
            "name": "maxPriceAgeS",
            "type": "u32"
          },
          {
            "name": "startDelaySecs",
            "type": "u16"
          },
          {
            "name": "freerollDailyCap",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "arenaAsset",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feed",
            "docs": [
              "Oracle feed PDA `[\"price_feed\", \"pyth-lazer\", <lazer_id>]` (checked off-chain at setup)."
            ],
            "type": "pubkey"
          },
          {
            "name": "lazerId",
            "type": "u32"
          },
          {
            "name": "exponent",
            "docs": [
              "|exponent| from Pyth's list (e.g. 8 for SOL, 10 for BONK). The feed account's own",
              "exponent field is never read (spike 01: it says 8 for every feed)."
            ],
            "type": "u8"
          },
          {
            "name": "enabled",
            "docs": [
              "Disabled: no new buys; sells and valuation still work."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "arenaUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arenaId",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "protocol",
      "docs": [
        "Seeds `[\"protocol\"]`. Global caps, admin-adjustable behind a Squads multisig (V2)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "Squads vault on mainnet."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "Rent-exempt system account (checked at init/update)."
            ],
            "type": "pubkey"
          },
          {
            "name": "maxEntryLamports",
            "docs": [
              "Global entry cap; 0 = free play only (Stage 2)."
            ],
            "type": "u64"
          },
          {
            "name": "matchFeeLamports",
            "docs": [
              "D1: reimburses the joiner's MagicBlock delegation fee."
            ],
            "type": "u64"
          },
          {
            "name": "settlerTipLamports",
            "docs": [
              "<= MAX_SETTLER_TIP_LAMPORTS."
            ],
            "type": "u64"
          },
          {
            "name": "maxRakeBps",
            "docs": [
              "<= MAX_FEE_BPS; arenas cannot exceed it."
            ],
            "type": "u16"
          },
          {
            "name": "paused",
            "docs": [
              "Blocks create/join/sponsor; never blocks exits (cancel, settle, refund, close)."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "protocolArgs",
      "docs": [
        "The numeric `Protocol` fields. `admin` is the signer (init) or an explicit argument",
        "(update); `treasury` is an account."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "maxEntryLamports",
            "type": "u64"
          },
          {
            "name": "matchFeeLamports",
            "type": "u64"
          },
          {
            "name": "settlerTipLamports",
            "type": "u64"
          },
          {
            "name": "maxRakeBps",
            "type": "u16"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "protocolUpdated",
      "docs": [
        "v2 PRD §8. Notifications only; clients read state from accounts."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "maxEntryLamports",
            "type": "u64"
          },
          {
            "name": "matchFeeLamports",
            "type": "u64"
          },
          {
            "name": "settlerTipLamports",
            "type": "u64"
          },
          {
            "name": "maxRakeBps",
            "type": "u16"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    }
  ]
};
