// Generated from contracts/out/OwoDesk.sol/OwoDesk.json
export const deskAbi = [
 {
  "type": "constructor",
  "inputs": [
   {
    "name": "_musd",
    "type": "address",
    "internalType": "contract IERC20"
   },
   {
    "name": "_borrowerOps",
    "type": "address",
    "internalType": "contract IBorrowerOperationsSignatures"
   },
   {
    "name": "_admin",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "_relayer",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "_treasury",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "receive",
  "stateMutability": "payable"
 },
 {
  "type": "function",
  "name": "CASH_OUT_TYPEHASH",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "REFUND_CANCELLED",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "REFUND_EXPIRED",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "REFUND_REJECTED",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "ROUTE_BORROW",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "ROUTE_PERMIT",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "ROUTE_WALLET",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "acceptAdmin",
  "inputs": [],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "admin",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "borrowAndCashOut",
  "inputs": [
   {
    "name": "intent",
    "type": "tuple",
    "internalType": "struct OwoDesk.Intent",
    "components": [
     {
      "name": "owner",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "amount",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "minNaira",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "recipientHash",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "deadline",
      "type": "uint256",
      "internalType": "uint256"
     }
    ]
   },
   {
    "name": "intentSig",
    "type": "bytes",
    "internalType": "bytes"
   },
   {
    "name": "upperHint",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "lowerHint",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "borrowSig",
    "type": "bytes",
    "internalType": "bytes"
   },
   {
    "name": "borrowDeadline",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "borrowerOps",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "contract IBorrowerOperationsSignatures"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "cancel",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "cashOut",
  "inputs": [
   {
    "name": "amount",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "minNaira",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "recipientHash",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "outputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "cashOutWithPermit",
  "inputs": [
   {
    "name": "intent",
    "type": "tuple",
    "internalType": "struct OwoDesk.Intent",
    "components": [
     {
      "name": "owner",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "amount",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "minNaira",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "recipientHash",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "deadline",
      "type": "uint256",
      "internalType": "uint256"
     }
    ]
   },
   {
    "name": "intentSig",
    "type": "bytes",
    "internalType": "bytes"
   },
   {
    "name": "permitDeadline",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "v",
    "type": "uint8",
    "internalType": "uint8"
   },
   {
    "name": "r",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "s",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "outputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "dayCap",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "dayRoom",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "domainSeparator",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "getOrder",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "tuple",
    "internalType": "struct OwoDesk.Order",
    "components": [
     {
      "name": "owner",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "status",
      "type": "uint8",
      "internalType": "enum OwoDesk.Status"
     },
     {
      "name": "openedAt",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "takenAt",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "amount",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "minNaira",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "paidNaira",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "recipientHash",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "payoutRef",
      "type": "bytes32",
      "internalType": "bytes32"
     }
    ]
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "intentDigest",
  "inputs": [
   {
    "name": "intent",
    "type": "tuple",
    "internalType": "struct OwoDesk.Intent",
    "components": [
     {
      "name": "owner",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "amount",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "minNaira",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "recipientHash",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "deadline",
      "type": "uint256",
      "internalType": "uint256"
     }
    ]
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "maxOrder",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "minOrder",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "musd",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "contract IERC20"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "nonces",
  "inputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "orderCount",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "orders",
  "inputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "owner",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "status",
    "type": "uint8",
    "internalType": "enum OwoDesk.Status"
   },
   {
    "name": "openedAt",
    "type": "uint64",
    "internalType": "uint64"
   },
   {
    "name": "takenAt",
    "type": "uint64",
    "internalType": "uint64"
   },
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "minNaira",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "paidNaira",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "recipientHash",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "payoutRef",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "paused",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "pendingAdmin",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "proposeAdmin",
  "inputs": [
   {
    "name": "_admin",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "reclaim",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "reject",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "relayer",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "setLimits",
  "inputs": [
   {
    "name": "_minOrder",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "_maxOrder",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "_dayCap",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "_settleWindow",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "setPaused",
  "inputs": [
   {
    "name": "_paused",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "setRelayer",
  "inputs": [
   {
    "name": "_relayer",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "setTreasury",
  "inputs": [
   {
    "name": "_treasury",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "settle",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "paidNaira",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "payoutRef",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "settleWindow",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "take",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "today",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "treasury",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "volumeByDay",
  "inputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "event",
  "name": "AdminAccepted",
  "inputs": [
   {
    "name": "admin",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "AdminProposed",
  "inputs": [
   {
    "name": "pendingAdmin",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "LimitsSet",
  "inputs": [
   {
    "name": "minOrder",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "maxOrder",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "dayCap",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "settleWindow",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Opened",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "owner",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "minNaira",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "recipientHash",
    "type": "bytes32",
    "indexed": false,
    "internalType": "bytes32"
   },
   {
    "name": "route",
    "type": "uint8",
    "indexed": false,
    "internalType": "uint8"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Paid",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "paidNaira",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "payoutRef",
    "type": "bytes32",
    "indexed": false,
    "internalType": "bytes32"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "PausedSet",
  "inputs": [
   {
    "name": "paused",
    "type": "bool",
    "indexed": false,
    "internalType": "bool"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Refunded",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "reason",
    "type": "uint8",
    "indexed": false,
    "internalType": "uint8"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "RelayerSet",
  "inputs": [
   {
    "name": "relayer",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Taken",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "TreasurySet",
  "inputs": [
   {
    "name": "treasury",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "error",
  "name": "BadAmount",
  "inputs": []
 },
 {
  "type": "error",
  "name": "BadLimits",
  "inputs": []
 },
 {
  "type": "error",
  "name": "BadRecipient",
  "inputs": []
 },
 {
  "type": "error",
  "name": "BadSignature",
  "inputs": []
 },
 {
  "type": "error",
  "name": "BadStatus",
  "inputs": []
 },
 {
  "type": "error",
  "name": "Expired",
  "inputs": []
 },
 {
  "type": "error",
  "name": "MintMismatch",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NairaBelowFloor",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotAdmin",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotOwner",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotRelayer",
  "inputs": []
 },
 {
  "type": "error",
  "name": "OverDayCap",
  "inputs": []
 },
 {
  "type": "error",
  "name": "Paused",
  "inputs": []
 },
 {
  "type": "error",
  "name": "Reentrancy",
  "inputs": []
 },
 {
  "type": "error",
  "name": "TooEarly",
  "inputs": []
 },
 {
  "type": "error",
  "name": "TransferFailed",
  "inputs": []
 },
 {
  "type": "error",
  "name": "ZeroAddress",
  "inputs": []
 }
] as const;
