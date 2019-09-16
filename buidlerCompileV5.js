module.exports = {
  defaultNetwork: "develop",

  networks: {
    develop: {
      gas: 6000000
    }
  },

  solc: {
    version: "0.5.11",
    optimizer: {
      enabled: true,
      runs: 200
    }
  },

  paths: {
    sources: "./contractsV5",
    tests: "./testV5"
  },

  mocha: {
    enableTimeouts: false
  }
};
