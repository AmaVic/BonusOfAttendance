# Bonus of Attendance
A simple web application enabling students from the [Blockchain Technology course of the University of Namur](https://www.unamur.be/en/blockchain-technology) to check the bonus points they have earned by attending specific events.

The attendance is tracked through the Proof of Attendance Protocol (POAP).

# How it Works

The application is built using HTML, CSS, and JavaScript. It uses the Ethers.js library to interact with the Ethereum blockchain.

The application is deployed on GitHub Pages and does not require a backend server.

If you want to use it locally, you can clone this repository and open the `index.html` file in your browser.

If you want to adjust it for your own use, you can modify the `config.js` file.

# Configuration

The configuration is stored in the `config.js` file. It contains the following configuration options:

- `RPC_CONFIG`: The configuration for the RPC endpoints.
- `POAP_CONFIG`: The configuration for the POAP contract.
- `TARGET_EVENT_IDS`: The list of event IDs to check for.
- `POAP_CONTRACT_ADDRESS`: The address of the POAP contract.
- `POINTS_PER_POAP`: The number of points per POAP.
- `SPECIAL_RULES`: The special rules for the calculation of bonus points.

You can open the `config.js` file to see how the web application is currently configured.