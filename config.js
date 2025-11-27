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
