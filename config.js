// RPC Endpoints (Public with Fallbacks)
const RPC_CONFIG = {
    gnosis: [
        "https://rpc.gnosischain.com",
        "https://gnosis.publicnode.com",
        "https://rpc.ankr.com/gnosis",
        "https://gnosis-rpc.publicnode.com",
        "https://1rpc.io/gnosis"
    ],
    base: [
        "https://mainnet.base.org",
        "https://base.publicnode.com",
        "https://base.meowrpc.com",
        "https://base-rpc.publicnode.com",
        "https://1rpc.io/base",
        "https://base.drpc.org",
        "https://base.gateway.tenderly.co",
        "https://rpc.notadegen.com/base",
        "https://base.blockpi.network/v1/rpc/public",
        "https://base-pokt.nodies.app"
    ]
};

// POAP Configuration
// Event names can be fetched from API, but are included here as fallback
const POAP_CONFIG = {
    // List of POAP events to check for
    events: [
        { id: 210723, name: "Intervention @ UNamur" },
        { id: 214291, name: "Stablecoins et Monnaie Programmable" }
    ],

    // Bonus points per POAP
    pointsPerPoap: 0.33,

    // Special rule: 3 POAPs = 1 point (instead of 0.99)
    specialRules: {
        exactCount: 3,
        points: 1
    }
};

const TARGET_EVENT_IDS = POAP_CONFIG.events.map(e => e.id);
const POAP_CONTRACT_ADDRESS = "0x22C1f6050E56d2876009903609a2cC3fEf83B415";

// ABI for POAP Contract (Minimal needed)
const POAP_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
    "function tokenEvent(uint256 tokenId) view returns (uint256)"
];
