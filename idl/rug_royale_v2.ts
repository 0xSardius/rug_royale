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
  "docs": [
    "`#[ephemeral]` injects `process_undelegation`, the callback MagicBlock's Delegation",
    "Program invokes to hand `Match` back to this program after `finalize_match` commits and",
    "undelegates it. It must sit before `#[program]`."
  ],
  "instructions": [
    {
      "name": "cancelMatch",
      "discriminator": [
        142,
        136,
        247,
        45,
        92,
        112,
        180,
        83
      ],
      "accounts": [
        {
          "name": "caller",
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
          "name": "pot",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pot.matchAccount",
                "account": "pot"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true
        },
        {
          "name": "sponsor",
          "docs": [
            "(default) pubkey as a writable account."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "treasury",
          "writable": true
        }
      ],
      "args": []
    },
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
      "name": "createMatch",
      "discriminator": [
        107,
        2,
        184,
        145,
        70,
        142,
        17,
        165
      ],
      "accounts": [
        {
          "name": "creator",
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
          "name": "matchAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "args.nonce"
              }
            ]
          }
        },
        {
          "name": "pot",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              }
            ]
          }
        },
        {
          "name": "creatorStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "creator"
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
              "name": "createMatchArgs"
            }
          }
        }
      ]
    },
    {
      "name": "delegateMatch",
      "discriminator": [
        30,
        116,
        9,
        69,
        147,
        61,
        133,
        238
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "pot",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              }
            ]
          }
        },
        {
          "name": "bufferMatchAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              }
            ],
            "program": {
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
          }
        },
        {
          "name": "delegationRecordMatchAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataMatchAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "matchAccount",
          "docs": [
            "owner and status are checked in the handler. `del` makes `#[delegate]` add the",
            "buffer / record / metadata accounts and `delegate_match_account`."
          ],
          "writable": true
        },
        {
          "name": "ownerProgram",
          "address": "2hcR5rib7mNkcFHnPEfjhH1yJdNsPmK6SVkU3dDjD9Cr"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "finalizeMatch",
      "discriminator": [
        6,
        103,
        47,
        7,
        66,
        1,
        85,
        207
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "matchAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount.seats0.player",
                "account": "match"
              },
              {
                "kind": "account",
                "path": "matchAccount.nonce",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "arena",
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
                "path": "matchAccount.arenaId",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
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
      "name": "joinMatch",
      "discriminator": [
        244,
        8,
        47,
        130,
        192,
        59,
        179,
        44
      ],
      "accounts": [
        {
          "name": "opponent",
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
                "path": "pot.arenaId",
                "account": "pot"
              }
            ]
          }
        },
        {
          "name": "matchAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "pot.creator",
                "account": "pot"
              },
              {
                "kind": "account",
                "path": "matchAccount.nonce",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "pot",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              }
            ]
          }
        },
        {
          "name": "creatorStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pot.creator",
                "account": "pot"
              }
            ]
          }
        },
        {
          "name": "opponentStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "opponent"
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
          "name": "sessionKey",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "refundStale",
      "discriminator": [
        7,
        154,
        200,
        33,
        10,
        183,
        0,
        95
      ],
      "accounts": [
        {
          "name": "caller",
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
          "name": "pot",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pot.matchAccount",
                "account": "pot"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true
        },
        {
          "name": "opponent",
          "writable": true
        },
        {
          "name": "sponsor",
          "writable": true,
          "optional": true
        },
        {
          "name": "treasury",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "settle",
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "settler",
          "docs": [
            "Receives the settler tip."
          ],
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
          "name": "pot",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pot.matchAccount",
                "account": "pot"
              }
            ]
          }
        },
        {
          "name": "matchAccount",
          "docs": [
            "and data are checked in the handler (`MatchStillDelegated`, `MatchNotFinalized`)."
          ]
        },
        {
          "name": "creatorStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pot.creator",
                "account": "pot"
              }
            ]
          }
        },
        {
          "name": "opponentStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pot.opponent",
                "account": "pot"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true
        },
        {
          "name": "opponent",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "sponsorMatch",
      "discriminator": [
        94,
        2,
        117,
        187,
        177,
        159,
        99,
        58
      ],
      "accounts": [
        {
          "name": "sponsor",
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
          "name": "pot",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pot.matchAccount",
                "account": "pot"
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
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "trade",
      "discriminator": [
        178,
        144,
        26,
        216,
        241,
        187,
        206,
        130
      ],
      "accounts": [
        {
          "name": "signer",
          "docs": [
            "The seat's wallet or session key."
          ],
          "signer": true
        },
        {
          "name": "matchAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount.seats0.player",
                "account": "match"
              },
              {
                "kind": "account",
                "path": "matchAccount.nonce",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "arena",
          "docs": [
            "Base-layer account; the ER clones it read-only."
          ],
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
                "path": "matchAccount.arenaId",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "priceFeed"
        }
      ],
      "args": [
        {
          "name": "assetIndex",
          "type": "u8"
        },
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "limitPrice",
          "type": "u64"
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
      "name": "match",
      "discriminator": [
        236,
        63,
        169,
        38,
        15,
        56,
        196,
        162
      ]
    },
    {
      "name": "playerStats",
      "discriminator": [
        169,
        146,
        242,
        176,
        102,
        118,
        231,
        172
      ]
    },
    {
      "name": "pot",
      "discriminator": [
        238,
        118,
        60,
        175,
        178,
        191,
        59,
        58
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
      "name": "matchCancelled",
      "discriminator": [
        99,
        86,
        22,
        122,
        82,
        247,
        60,
        113
      ]
    },
    {
      "name": "matchCreated",
      "discriminator": [
        151,
        176,
        11,
        24,
        34,
        225,
        227,
        16
      ]
    },
    {
      "name": "matchFinalized",
      "discriminator": [
        234,
        71,
        250,
        217,
        155,
        97,
        21,
        217
      ]
    },
    {
      "name": "matchJoined",
      "discriminator": [
        94,
        7,
        113,
        154,
        236,
        126,
        100,
        39
      ]
    },
    {
      "name": "matchRefunded",
      "discriminator": [
        185,
        57,
        210,
        244,
        121,
        237,
        113,
        232
      ]
    },
    {
      "name": "matchSettled",
      "discriminator": [
        243,
        201,
        134,
        151,
        193,
        131,
        223,
        150
      ]
    },
    {
      "name": "matchSponsored",
      "discriminator": [
        118,
        143,
        238,
        136,
        80,
        70,
        167,
        68
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
    },
    {
      "name": "traded",
      "discriminator": [
        225,
        202,
        73,
        175,
        147,
        43,
        160,
        150
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
      "name": "createMatchArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "windowSecs",
            "type": "u32"
          },
          {
            "name": "entryLamports",
            "type": "u64"
          },
          {
            "name": "allowedOpponent",
            "docs": [
              "Default = anyone may join."
            ],
            "type": "pubkey"
          },
          {
            "name": "joinDeadline",
            "type": "i64"
          },
          {
            "name": "sessionKey",
            "docs": [
              "V5: browser-held key that may sign `trade` for this seat. Default = wallet only."
            ],
            "type": "pubkey"
          },
          {
            "name": "validator",
            "docs": [
              "V4 / D6: ER validator identity (region) pinned at delegation."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "match",
      "docs": [
        "Seeds `[\"match\", creator, nonce.to_le_bytes()]`. Base while Open; delegated to the ER",
        "from `delegate_match` until `finalize_match` commits and undelegates it (V1).",
        "",
        "FIXED LAYOUT (G9): `status` @ 8. Do not reorder or insert fields."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "matchStatus"
              }
            }
          },
          {
            "name": "result",
            "docs": [
              "RESULT_PENDING | RESULT_CREATOR | RESULT_OPPONENT | RESULT_TIE"
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "assetCount",
            "docs": [
              "Copied from the arena at create."
            ],
            "type": "u8"
          },
          {
            "name": "arenaId",
            "type": "u16"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "tradeFeeBps",
            "docs": [
              "Snapshotted from the arena at create so admin changes never touch a live match (I9)."
            ],
            "type": "u16"
          },
          {
            "name": "maxPriceAgeS",
            "type": "u32"
          },
          {
            "name": "pot",
            "type": "pubkey"
          },
          {
            "name": "seats",
            "docs": [
              "[creator, opponent]"
            ],
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "seat"
                  }
                },
                2
              ]
            }
          },
          {
            "name": "finalValues",
            "docs": [
              "Micro-USD."
            ],
            "type": {
              "array": [
                "u64",
                2
              ]
            }
          },
          {
            "name": "markPrices",
            "docs": [
              "Raw feed price used per asset at finalize (audit trail); 0 when unused."
            ],
            "type": {
              "array": [
                "u64",
                10
              ]
            }
          },
          {
            "name": "markPublishTime",
            "docs": [
              "Oldest `publish_time` among the marks used."
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "matchCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "refundedEntry",
            "docs": [
              "Entry + fee share returned to the creator."
            ],
            "type": "u64"
          },
          {
            "name": "refundedSponsored",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "matchCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "pot",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "arenaId",
            "type": "u16"
          },
          {
            "name": "windowSecs",
            "type": "u32"
          },
          {
            "name": "entryLamports",
            "type": "u64"
          },
          {
            "name": "allowedOpponent",
            "type": "pubkey"
          },
          {
            "name": "joinDeadline",
            "type": "i64"
          },
          {
            "name": "validator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "matchFinalized",
      "docs": [
        "Emitted in the ER when the result is final (before the commit lands on base)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "result",
            "type": "u8"
          },
          {
            "name": "finalValues",
            "type": {
              "array": [
                "u64",
                2
              ]
            }
          },
          {
            "name": "markPublishTime",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "matchJoined",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "opponent",
            "type": "pubkey"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "matchRefunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "refundedEach",
            "docs": [
              "Entry + fee share returned to each player."
            ],
            "type": "u64"
          },
          {
            "name": "refundedSponsored",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "matchSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "result",
            "type": "u8"
          },
          {
            "name": "finalValues",
            "type": {
              "array": [
                "u64",
                2
              ]
            }
          },
          {
            "name": "prize",
            "type": "u64"
          },
          {
            "name": "rake",
            "type": "u64"
          },
          {
            "name": "matchFee",
            "docs": [
              "Match fee reimbursed to the joiner (D1, Q1)."
            ],
            "type": "u64"
          },
          {
            "name": "tip",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "matchSponsored",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "sponsor",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "total",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "matchStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "active"
          },
          {
            "name": "finalized"
          }
        ]
      }
    },
    {
      "name": "playerStats",
      "docs": [
        "Seeds `[\"player\", wallet]`. Freeroll cap (V9) plus lifetime stats."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "day",
            "docs": [
              "`unix_ts / 86_400` of the last freeroll counted."
            ],
            "type": "u32"
          },
          {
            "name": "freerollsToday",
            "type": "u8"
          },
          {
            "name": "matches",
            "type": "u32"
          },
          {
            "name": "wins",
            "type": "u32"
          },
          {
            "name": "ties",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pot",
      "docs": [
        "Seeds `[\"pot\", match]`. Holds the real SOL; base only, never delegated (V1, G1).",
        "",
        "FIXED LAYOUT (G9). No `Option` fields; `Pubkey::default()` means unset. Lobby `memcmp`",
        "filters read the offsets below (mirrored in packages/sdk/src/v2/layout.ts). Do not",
        "reorder or insert fields."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "potStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "arenaId",
            "type": "u16"
          },
          {
            "name": "windowSecs",
            "type": "u32"
          },
          {
            "name": "entryLamports",
            "type": "u64"
          },
          {
            "name": "sponsoredLamports",
            "type": "u64"
          },
          {
            "name": "matchFeeLamports",
            "docs": [
              "F, snapshotted from Protocol at create."
            ],
            "type": "u64"
          },
          {
            "name": "feeShareLamports",
            "docs": [
              "ceil(F/2) if entry == 0, else 0 (V7, Q1)."
            ],
            "type": "u64"
          },
          {
            "name": "settlerTipLamports",
            "docs": [
              "Snapshotted at create."
            ],
            "type": "u64"
          },
          {
            "name": "rakeBps",
            "docs": [
              "Snapshotted at create."
            ],
            "type": "u16"
          },
          {
            "name": "joinDeadline",
            "type": "i64"
          },
          {
            "name": "endTs",
            "docs": [
              "Set at join."
            ],
            "type": "i64"
          },
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "opponent",
            "docs": [
              "Default until joined."
            ],
            "type": "pubkey"
          },
          {
            "name": "allowedOpponent",
            "docs": [
              "Default = anyone."
            ],
            "type": "pubkey"
          },
          {
            "name": "sponsor",
            "docs": [
              "Default = none."
            ],
            "type": "pubkey"
          },
          {
            "name": "validator",
            "docs": [
              "ER validator identity (region) pinned at delegation (V4)."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "potStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "active"
          },
          {
            "name": "settled"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "refunded"
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
    },
    {
      "name": "seat",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "sessionKey",
            "docs": [
              "V5: may sign `trade` for this seat only, while the window is open. Default = wallet only."
            ],
            "type": "pubkey"
          },
          {
            "name": "cash",
            "docs": [
              "Micro-USD."
            ],
            "type": "u64"
          },
          {
            "name": "qty",
            "docs": [
              "Per arena asset, 1e-6 token units."
            ],
            "type": {
              "array": [
                "u64",
                10
              ]
            }
          },
          {
            "name": "trades",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "side",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "buy"
          },
          {
            "name": "sell"
          }
        ]
      }
    },
    {
      "name": "traded",
      "docs": [
        "Emitted in the ER; the client reads it from its own transaction result."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "seat",
            "type": "u8"
          },
          {
            "name": "assetIndex",
            "type": "u8"
          },
          {
            "name": "side",
            "docs": [
              "0 = buy, 1 = sell."
            ],
            "type": "u8"
          },
          {
            "name": "amountIn",
            "type": "u64"
          },
          {
            "name": "amountOut",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "publishTime",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
