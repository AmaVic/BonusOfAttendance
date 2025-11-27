// Configuration
const TARGET_EVENT_IDS = [210723, 214291];
const POAP_CONTRACT_ADDRESS = "0x22C1f6050E56d2876009903609a2cC3fEf83B415";

// RPC Endpoints (Public with Fallbacks)
const RPC_CONFIG = {
    gnosis: [
        "https://rpc.gnosischain.com",
        "https://gnosis.publicnode.com",
        "https://rpc.ankr.com/gnosis"
    ],
    base: [
        "https://mainnet.base.org",
        "https://base.publicnode.com",
        "https://base.meowrpc.com"
    ]
};

// ABI for POAP Contract (Minimal needed)
const POAP_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
    "function tokenEvent(uint256 tokenId) view returns (uint256)"
];

// DOM Elements
const walletInput = document.getElementById('walletAddress');
const checkButton = document.getElementById('checkButton');
const btnText = document.querySelector('.btn-text');
const loader = document.querySelector('.loader');
const errorMessage = document.getElementById('error-message');
const resultsSection = document.getElementById('results-section');
const totalPointsEl = document.getElementById('totalPoints');
const poapListEl = document.getElementById('poapList');
const noPoapsMsg = document.getElementById('no-poaps-msg');

// Event Listeners
checkButton.addEventListener('click', handleCheck);
walletInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleCheck();
});

async function handleCheck() {
    const address = walletInput.value.trim();

    // Reset UI
    resetUI();

    // Validation
    if (!ethers.isAddress(address)) {
        showError("Please enter a valid Ethereum address.");
        return;
    }

    setLoading(true);

    try {
        const foundPoaps = await checkAllNetworks(address);
        displayResults(foundPoaps);
    } catch (error) {
        console.error("Error checking POAPs:", error);
        showError("An error occurred while fetching data. Please try again.");
    } finally {
        setLoading(false);
    }
}

async function checkAllNetworks(address) {
    const networks = ['gnosis', 'base'];
    const results = [];

    console.log("Starting check for address:", address);

    // Check both networks in parallel
    const promises = networks.map(async (networkName) => {
        console.log(`Checking network: ${networkName}`);

        // Try RPCs in order until one works
        const urls = RPC_CONFIG[networkName];
        for (const url of urls) {
            try {
                console.log(`[${networkName}] Trying RPC: ${url}`);
                const provider = new ethers.JsonRpcProvider(url);

                // Test connection briefly
                await provider.getNetwork();

                // Add a timeout race for the actual check
                const result = await Promise.race([
                    checkNetworkForPOAPs(provider, address, networkName),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 20000))
                ]);

                console.log(`Result for ${networkName}:`, result);
                return result; // Success, return results
            } catch (e) {
                console.warn(`[${networkName}] RPC ${url} failed or timed out:`, e);
                // Continue to next URL
            }
        }

        console.error(`[${networkName}] All RPCs failed.`);
        showError(`Could not connect to ${networkName} network. Some results may be missing.`);
        return [];
    });

    const networkResults = await Promise.all(promises);

    // Flatten results
    networkResults.forEach(res => results.push(...res));

    console.log("All results:", results);
    return results;
}

async function checkNetworkForPOAPs(provider, address, networkName) {
    const contract = new ethers.Contract(POAP_CONTRACT_ADDRESS, POAP_ABI, provider);
    let tokenIds = [];

    try {
        console.log(`[${networkName}] Fetching balance...`);
        const balance = await contract.balanceOf(address);
        const count = Number(balance);
        console.log(`[${networkName}] Balance: ${count}`);

        if (count === 0) return [];

        // Try tokenOfOwnerByIndex first
        try {
            const limit = Math.min(count, 50);
            console.log(`[${networkName}] Fetching ${limit} tokens via enumeration...`);
            const tokenPromises = [];
            for (let i = 0; i < limit; i++) {
                tokenPromises.push(contract.tokenOfOwnerByIndex(address, i));
            }
            tokenIds = await Promise.all(tokenPromises);
        } catch (enumError) {
            console.warn(`[${networkName}] Enumeration failed, trying logs...`, enumError);
            // If logs fail, this WILL throw and trigger the RPC retry
            tokenIds = await getTokensFromLogs(provider, address);
        }

        console.log(`[${networkName}] Token IDs fetched:`, tokenIds.length);

        // Check Event IDs for each token
        const eventPromises = tokenIds.map(async (tokenId) => {
            try {
                const eventId = await contract.tokenEvent(tokenId);
                return { tokenId, eventId: Number(eventId) };
            } catch (e) {
                console.warn(`[${networkName}] Error fetching event for token ${tokenId}:`, e);
                return null;
            }
        });

        const events = await Promise.all(eventPromises);
        console.log(`[${networkName}] Events fetched:`, events.length);

        // Filter for targets
        const found = [];
        events.forEach(item => {
            if (item && TARGET_EVENT_IDS.includes(item.eventId)) {
                found.push(item); // Push the whole item {tokenId, eventId}
            }
        });
        return found;

    } catch (error) {
        console.warn(`Error on network ${networkName}:`, error);
        throw error; // Propagate error to trigger RPC retry
    }
}

async function getTokensFromLogs(provider, address) {
    try {
        // Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
        const topic0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
        const topic2 = ethers.zeroPadValue(address, 32); // 'to' address

        const filter = {
            address: POAP_CONTRACT_ADDRESS,
            topics: [topic0, null, topic2],
            fromBlock: 0, // Try from genesis. If this fails, we might need a smaller range.
            toBlock: 'latest'
        };

        console.log("Fetching logs with filter:", filter);
        const logs = await provider.getLogs(filter);

        // Extract token IDs from topic 3
        const ids = logs.map(log => BigInt(log.topics[3]));
        // Deduplicate
        return [...new Set(ids)];
    } catch (e) {
        console.error("Log fetch failed:", e);
        throw e; // THROW so the main loop tries the next RPC
    }
}

function displayResults(foundPoaps) {
    resultsSection.classList.remove('hidden');

    // Calculate Score
    // "0.33 / collected POAP"
    // Special rule: 3 POAPs = 1 point (instead of 0.99)
    let finalScore = foundPoaps.length * 0.33;
    if (foundPoaps.length === 3) {
        finalScore = 1;
    }

    // Animate Score
    animateValue(totalPointsEl, 0, finalScore, 1000);

    // Render List
    poapListEl.innerHTML = '';

    if (foundPoaps.length === 0) {
        noPoapsMsg.classList.remove('hidden');
    } else {
        noPoapsMsg.classList.add('hidden');
        foundPoaps.forEach(item => {
            const { eventId, tokenId } = item;
            const li = document.createElement('li');
            li.className = 'poap-item';

            // Map ID to Name
            let name = "Unknown Event";
            if (eventId === 210723) name = "Intervention @ UNamur";
            if (eventId === 214291) name = "Stablecoins et Monnaie Programmable";

            const link = `https://collectors.poap.xyz/token/${tokenId}`;

            li.innerHTML = `
                <div class="poap-info">
                    <a href="${link}" target="_blank" class="poap-name-link">${name} <span class="external-icon">↗</span></a>
                    <span class="poap-id">#${eventId}</span>
                </div>
                <span class="poap-points">0.33 pts</span>
            `;
            poapListEl.appendChild(li);
        });
    }
}

// UI Helpers
function setLoading(isLoading) {
    if (isLoading) {
        checkButton.disabled = true;
        btnText.classList.add('hidden');
        loader.classList.remove('hidden');
    } else {
        checkButton.disabled = false;
        btnText.classList.remove('hidden');
        loader.classList.add('hidden');
    }
}

function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.classList.remove('hidden');
}

function resetUI() {
    errorMessage.classList.add('hidden');
    resultsSection.classList.add('hidden');
    poapListEl.innerHTML = '';
    totalPointsEl.textContent = '0';
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);

        const current = progress * (end - start) + start;
        // Format to max 2 decimals, remove trailing zeros if integer
        obj.innerHTML = parseFloat(current.toFixed(2));

        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = parseFloat(end.toFixed(2));
        }
    };
    window.requestAnimationFrame(step);
}
