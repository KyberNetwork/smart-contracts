module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 9545,
      gas: 4700000,
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
  }
};
