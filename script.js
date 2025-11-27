// Configuration (POAP events are now in config.js)
const TARGET_EVENT_IDS = POAP_CONFIG.events.map(e => e.id);
const POAP_CONTRACT_ADDRESS = "0x22C1f6050E56d2876009903609a2cC3fEf83B415";

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
const statusMessage = document.getElementById('status-message');
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
    const maxRetries = 2; // Auto-retry failed networks

    console.log("Starting check for address:", address);

    // Check both networks in parallel
    const promises = networks.map(async (networkName) => {
        showStatus(`Connecting to ${networkName.charAt(0).toUpperCase() + networkName.slice(1)} network...`);
        console.log(`Checking network: ${networkName}`);

        // Try RPCs in order until one works, with retries
        const urls = RPC_CONFIG[networkName];
        let lastError = null;

        for (let retry = 0; retry < maxRetries; retry++) {
            for (const url of urls) {
                try {
                    console.log(`[${networkName}] Attempt ${retry + 1}/${maxRetries}, RPC: ${url}`);
                    const provider = new ethers.JsonRpcProvider(url);

                    // Test connection briefly
                    await provider.getNetwork();

                    showStatus(`Fetching POAPs from ${networkName.charAt(0).toUpperCase() + networkName.slice(1)}...`);

                    // Add a timeout race for the actual check
                    const result = await Promise.race([
                        checkNetworkForPOAPs(provider, address, networkName),
                        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 20000))
                    ]);

                    console.log(`Result for ${networkName}:`, result);
                    return result; // Success, return results
                } catch (e) {
                    lastError = e;
                    console.warn(`[${networkName}] RPC ${url} failed or timed out:`, e);
                    // Continue to next URL
                }
            }

            // If we've tried all URLs and still failed, wait a bit before retrying
            if (retry < maxRetries - 1) {
                showStatus(`Retrying ${networkName.charAt(0).toUpperCase() + networkName.slice(1)} network...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.error(`[${networkName}] All RPCs failed after ${maxRetries} attempts.`);
        showError(`Could not connect to ${networkName} network after ${maxRetries} attempts. Some results may be missing.`);
        return [];
    });

    const networkResults = await Promise.all(promises);

    // Flatten results
    networkResults.forEach(res => results.push(...res));

    if (results.length > 0) {
        showStatus('Fetching event details...');
    }

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

// Fetch event name from POAP API
async function fetchEventName(eventId) {
    try {
        const response = await fetch(`https://api.poap.tech/events/id/${eventId}`);
        if (response.ok) {
            const data = await response.json();
            return data.name || `Event #${eventId}`;
        }
    } catch (error) {
        console.warn(`Failed to fetch name for event ${eventId}:`, error);
    }
    return null; // Will fall back to config name
}

async function displayResults(foundPoaps) {
    resultsSection.classList.remove('hidden');

    // Calculate Score using config
    showStatus('Calculating bonus points...');
    let finalScore = foundPoaps.length * POAP_CONFIG.pointsPerPoap;
    if (foundPoaps.length === POAP_CONFIG.specialRules.exactCount) {
        finalScore = POAP_CONFIG.specialRules.points;
    }

    // Animate Score
    animateValue(totalPointsEl, 0, finalScore, 1000);

    // Render List
    poapListEl.innerHTML = '';

    if (foundPoaps.length === 0) {
        noPoapsMsg.classList.remove('hidden');
        statusMessage.classList.add('hidden');
    } else {
        noPoapsMsg.classList.add('hidden');

        // Fetch all event names in parallel first (with config fallback)
        showStatus(`Fetching event details (${foundPoaps.length} POAPs)...`);
        const namePromises = foundPoaps.map(async item => {
            // Try to get name from config first
            const configEvent = POAP_CONFIG.events.find(e => e.id === item.eventId);
            if (configEvent?.name) {
                return configEvent.name;
            }
            // Fallback to API
            return await fetchEventName(item.eventId);
        });
        const names = await Promise.all(namePromises);

        // Now display all POAPs with their fetched names
        foundPoaps.forEach((item, index) => {
            const { eventId, tokenId } = item;
            const li = document.createElement('li');
            li.className = 'poap-item';

            // Use fetched name or fallback
            const name = names[index] || `Event #${eventId}`;

            const link = `https://collectors.poap.xyz/token/${tokenId}`;

            li.innerHTML = `
                <div class="poap-info">
                    <a href="${link}" target="_blank" class="poap-name-link"><span class="poap-name">${name}</span> <span class="external-icon">↗</span></a>
                    <span class="poap-id">#${eventId}</span>
                </div>
                <span class="poap-points">${POAP_CONFIG.pointsPerPoap} pts</span>
            `;
            poapListEl.appendChild(li);
        });

        // Hide status message when done
        statusMessage.classList.add('hidden');
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

function showStatus(msg) {
    statusMessage.textContent = msg;
    statusMessage.classList.remove('hidden');
}

function resetUI() {
    errorMessage.classList.add('hidden');
    statusMessage.classList.add('hidden');
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
