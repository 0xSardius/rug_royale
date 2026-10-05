/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/rug_royale.json`.
 */
export type RugRoyale = {
  "address": "5USpVpECZNcq4ZjRUyATb9ykcSRzZ29vHDwNMYFwNJWE",
  "metadata": {
    "name": "rugRoyale",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Rug Royale: 1v1 trading duels on Solana"
  },
  "instructions": [
    {
      "name": "cancelDuel",
      "discriminator": [
        83,
        124,
        224,
        237,
        235,
        44,
        38,
        57
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "duel"
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
          "writable": true,
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "closeDuel",
      "discriminator": [
        206,
        171,
        112,
        150,
        214,
        78,
        213,
        196
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel"
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
          "writable": true,
          "optional": true
        },
        {
          "name": "creatorVaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "opponentVaultAuthority",
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              },
              {
                "kind": "account",
                "path": "duel.opponent",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "creatorQuoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creatorVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "creatorCoinVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creatorVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "coinMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "opponentQuoteVault",
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "opponentVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "opponentCoinVault",
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "opponentVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "coinMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "poolQuoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "poolCoinVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "coinMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "quoteMint",
          "writable": true
        },
        {
          "name": "coinMint",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "createDuel",
      "discriminator": [
        49,
        28,
        93,
        11,
        75,
        242,
        69,
        165
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "creatorVaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "creatorQuoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creatorVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "creatorCoinVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creatorVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "coinMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "poolQuoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "poolCoinVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "coinMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "quoteMint",
          "writable": true
        },
        {
          "name": "coinMint",
          "writable": true
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "tier",
          "type": "u8"
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
        }
      ]
    },
    {
      "name": "initConfig",
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
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
          "name": "args",
          "type": {
            "defined": {
              "name": "initConfigArgs"
            }
          }
        }
      ]
    },
    {
      "name": "joinDuel",
      "discriminator": [
        7,
        247,
        76,
        103,
        101,
        139,
        254,
        61
      ],
      "accounts": [
        {
          "name": "opponent",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "creatorVaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "creatorQuoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creatorVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "opponentVaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              },
              {
                "kind": "account",
                "path": "opponent"
              }
            ]
          }
        },
        {
          "name": "opponentQuoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "opponentVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "opponentCoinVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "opponentVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "coinMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "quoteMint",
          "writable": true
        },
        {
          "name": "coinMint"
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
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
            "Receives the tip."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "pool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "creatorVaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "opponentVaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              },
              {
                "kind": "account",
                "path": "duel.opponent",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "creatorQuoteVault",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creatorVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "creatorCoinVault",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creatorVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "coinMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "opponentQuoteVault",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "opponentVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "opponentCoinVault",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "opponentVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "coinMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "coinMint"
        },
        {
          "name": "treasury",
          "writable": true
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
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "sponsorPrize",
      "discriminator": [
        188,
        6,
        27,
        245,
        198,
        20,
        48,
        214
      ],
      "accounts": [
        {
          "name": "sponsor",
          "writable": true,
          "signer": true
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "duel"
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
      "name": "swap",
      "discriminator": [
        248,
        198,
        158,
        145,
        225,
        117,
        135,
        200
      ],
      "accounts": [
        {
          "name": "player",
          "signer": true
        },
        {
          "name": "duel",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "playerQuoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "playerCoinVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "coinMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "poolQuoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "poolCoinVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "coinMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "coinMint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "amountIn",
          "type": "u64"
        },
        {
          "name": "minOut",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "duel",
      "discriminator": [
        126,
        229,
        210,
        60,
        177,
        135,
        124,
        224
      ]
    },
    {
      "name": "escrow",
      "discriminator": [
        31,
        213,
        123,
        187,
        186,
        22,
        218,
        155
      ]
    },
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    }
  ],
  "events": [
    {
      "name": "duelCancelled",
      "discriminator": [
        138,
        79,
        20,
        163,
        207,
        11,
        111,
        213
      ]
    },
    {
      "name": "duelClosed",
      "discriminator": [
        171,
        179,
        76,
        207,
        174,
        164,
        108,
        230
      ]
    },
    {
      "name": "duelCreated",
      "discriminator": [
        137,
        77,
        22,
        196,
        90,
        147,
        23,
        37
      ]
    },
    {
      "name": "duelJoined",
      "discriminator": [
        44,
        42,
        14,
        246,
        9,
        32,
        169,
        167
      ]
    },
    {
      "name": "duelSettled",
      "discriminator": [
        254,
        160,
        50,
        193,
        155,
        112,
        122,
        64
      ]
    },
    {
      "name": "prizeSponsored",
      "discriminator": [
        248,
        48,
        90,
        82,
        226,
        96,
        215,
        55
      ]
    },
    {
      "name": "swapExecuted",
      "discriminator": [
        150,
        166,
        26,
        225,
        28,
        89,
        38,
        79
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "rakeTooHigh",
      "msg": "Rake exceeds the 10% maximum"
    },
    {
      "code": 6001,
      "name": "feeTooHigh",
      "msg": "Swap fee exceeds the 10% maximum"
    },
    {
      "code": 6002,
      "name": "invalidWindowSet",
      "msg": "Windows must be non-zero and ascending"
    },
    {
      "code": 6003,
      "name": "invalidTierSet",
      "msg": "Tiers must be non-zero"
    },
    {
      "code": 6004,
      "name": "invalidMintList",
      "msg": "Allowed mints must be 10 distinct mints, none equal to the quote mint"
    },
    {
      "code": 6005,
      "name": "invalidTier",
      "msg": "Tier index out of range"
    },
    {
      "code": 6006,
      "name": "invalidWindow",
      "msg": "Window is not one of the configured windows"
    },
    {
      "code": 6007,
      "name": "mintNotAllowed",
      "msg": "Coin is not in the allowed top-10 list"
    },
    {
      "code": 6008,
      "name": "deadlineTooSoon",
      "msg": "Join deadline is too soon"
    },
    {
      "code": 6009,
      "name": "deadlineTooFar",
      "msg": "Join deadline is too far in the future"
    },
    {
      "code": 6010,
      "name": "entryTooHigh",
      "msg": "Entry exceeds the configured maximum"
    },
    {
      "code": 6011,
      "name": "duelNotOpen",
      "msg": "Duel is not open"
    },
    {
      "code": 6012,
      "name": "duelNotActive",
      "msg": "Duel is not active"
    },
    {
      "code": 6013,
      "name": "joinDeadlinePassed",
      "msg": "Join deadline has passed"
    },
    {
      "code": 6014,
      "name": "deadlineNotReached",
      "msg": "Join deadline has not been reached"
    },
    {
      "code": 6015,
      "name": "cannotJoinOwnDuel",
      "msg": "Creator cannot join their own duel"
    },
    {
      "code": 6016,
      "name": "opponentNotAllowed",
      "msg": "Signer is not the allowed opponent"
    },
    {
      "code": 6017,
      "name": "sponsorMismatch",
      "msg": "Duel already has a different sponsor"
    },
    {
      "code": 6018,
      "name": "windowNotStarted",
      "msg": "Trading window has not started"
    },
    {
      "code": 6019,
      "name": "windowEnded",
      "msg": "Trading window has ended"
    },
    {
      "code": 6020,
      "name": "windowNotEnded",
      "msg": "Trading window has not ended"
    },
    {
      "code": 6021,
      "name": "notAParticipant",
      "msg": "Signer is not a participant in this duel"
    },
    {
      "code": 6022,
      "name": "wrongPool",
      "msg": "Pool does not belong to this duel"
    },
    {
      "code": 6023,
      "name": "insufficientBankroll",
      "msg": "Amount exceeds vault balance"
    },
    {
      "code": 6024,
      "name": "slippageExceeded",
      "msg": "Output below minimum (slippage)"
    },
    {
      "code": 6025,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6026,
      "name": "zeroOutput",
      "msg": "Swap output rounds to zero"
    },
    {
      "code": 6027,
      "name": "duelStillLive",
      "msg": "Duel is still open or active"
    },
    {
      "code": 6028,
      "name": "alreadyClosed",
      "msg": "Duel accounts are already closed"
    },
    {
      "code": 6029,
      "name": "escrowNotEmpty",
      "msg": "Escrow holds more than rent"
    },
    {
      "code": 6030,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6031,
      "name": "invalidSeedRatio",
      "msg": "Pool seed ratio must be at least 1"
    }
  ],
  "types": [
    {
      "name": "config",
      "docs": [
        "Seeds `[\"config\"]`. Written once by `init_config`; there is no update path (G12)."
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
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "allowedMints",
            "docs": [
              "Demo mints standing in for the StonkFun top 10."
            ],
            "type": {
              "array": [
                "pubkey",
                10
              ]
            }
          },
          {
            "name": "tiers",
            "docs": [
              "Bankroll per tier, raw quote units."
            ],
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          },
          {
            "name": "windows",
            "docs": [
              "Allowed `window_secs` values, ascending."
            ],
            "type": {
              "array": [
                "u32",
                4
              ]
            }
          },
          {
            "name": "poolSeedRatio",
            "docs": [
              "Pool seed = bankroll * ratio, in both quote and coin (G5)."
            ],
            "type": "u64"
          },
          {
            "name": "settlerTipLamports",
            "type": "u64"
          },
          {
            "name": "maxEntryLamports",
            "docs": [
              "Devnet safety cap on `entry_lamports` (G6)."
            ],
            "type": "u64"
          },
          {
            "name": "rakeBps",
            "type": "u16"
          },
          {
            "name": "swapFeeBps",
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mintAuthorityBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "duel",
      "docs": [
        "Seeds `[\"duel\", creator, nonce.to_le_bytes()]`. Never closed: it is the permanent record.",
        "",
        "FIXED LAYOUT (G9). No `Option` fields; `Pubkey::default()` means unset.",
        "Lobby `memcmp` filters depend on these byte offsets (see packages/sdk/src/layout.ts):",
        "`status` @ 8, `creator` @ 89, `opponent` @ 121. Do not reorder or insert fields."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "duelStatus"
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
            "name": "tier",
            "type": "u8"
          },
          {
            "name": "closed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "windowSecs",
            "type": "u32"
          },
          {
            "name": "nonce",
            "type": "u64"
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
            "name": "bankroll",
            "type": "u64"
          },
          {
            "name": "finalA",
            "docs": [
              "Creator final value, raw quote units."
            ],
            "type": "u64"
          },
          {
            "name": "finalB",
            "docs": [
              "Opponent final value, raw quote units."
            ],
            "type": "u64"
          },
          {
            "name": "joinDeadline",
            "type": "i64"
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
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "opponent",
            "type": "pubkey"
          },
          {
            "name": "allowedOpponent",
            "type": "pubkey"
          },
          {
            "name": "sponsor",
            "type": "pubkey"
          },
          {
            "name": "coin",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "duelCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duel",
            "type": "pubkey"
          },
          {
            "name": "refundedEntry",
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
      "name": "duelClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duel",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "duelCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duel",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "coin",
            "type": "pubkey"
          },
          {
            "name": "tier",
            "type": "u8"
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
            "name": "joinDeadline",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "duelJoined",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duel",
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
      "name": "duelSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duel",
            "type": "pubkey"
          },
          {
            "name": "result",
            "type": "u8"
          },
          {
            "name": "finalA",
            "type": "u64"
          },
          {
            "name": "finalB",
            "type": "u64"
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
            "name": "tip",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "duelStatus",
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
          }
        ]
      }
    },
    {
      "name": "escrow",
      "docs": [
        "Seeds `[\"escrow\", duel]`. Program-owned (G1): lamports above rent = entries + sponsored.",
        "Pay out by debiting lamports directly; never `system_program::transfer` FROM this account."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "initConfigArgs",
      "docs": [
        "Every `Config` field except `admin` (the signer) and bumps."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "allowedMints",
            "type": {
              "array": [
                "pubkey",
                10
              ]
            }
          },
          {
            "name": "tiers",
            "type": {
              "array": [
                "u64",
                3
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
            "name": "poolSeedRatio",
            "type": "u64"
          },
          {
            "name": "settlerTipLamports",
            "type": "u64"
          },
          {
            "name": "maxEntryLamports",
            "type": "u64"
          },
          {
            "name": "rakeBps",
            "type": "u16"
          },
          {
            "name": "swapFeeBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "pool",
      "docs": [
        "Seeds `[\"pool\", duel]`. One constant-product pool per duel; the only price source (REQ10)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duel",
            "type": "pubkey"
          },
          {
            "name": "coin",
            "type": "pubkey"
          },
          {
            "name": "quoteReserve",
            "type": "u64"
          },
          {
            "name": "tokenReserve",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "prizeSponsored",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duel",
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
      "name": "swapExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duel",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
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
            "name": "amountIn",
            "type": "u64"
          },
          {
            "name": "amountOut",
            "type": "u64"
          },
          {
            "name": "quoteReserve",
            "type": "u64"
          },
          {
            "name": "tokenReserve",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
