module.exports = {
  solc: {
    optimizer: require("./solcOptimiserSettings.js")
  },
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      gas: 6000000,
      gasPrice: 40000000000,
      network_id: "*" // Match any network id
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
  },
  mocha: {
      enableTimeouts: false
  }
};
