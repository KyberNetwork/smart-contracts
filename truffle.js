module.exports = {
  networks: {
    coverage: {
      host: "localhost",
      network_id: "*",
      port: 8555,         // <-- If you change this, also set the port option in .solcover.js.
      gas: 0xfffffffffff, // <-- Use this high gas value
      gasPrice: 0x01      // <-- Use this low gas price
    },
    rinkeby: {
      host: "localhost", // Connect to geth on the specified
      port: 8545,
      gasPrice: 4000000000,
      network_id: 4,
      gas: 4612388 // Gas limit used for deploys
    },
    simulation: {
      host: "blockchain", // Connect to geth on the specified
      port: 8545,
      gasPrice: 4000000000,
      network_id: 4,
      gas: 4612388 // Gas limit used for deploys
    }
  }
};
