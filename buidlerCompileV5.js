module.exports = {
  defaultNetwork: "develop",

  networks: {
    develop: {
      url: "http://127.0.0.1:8545",
      gas: 6000000,
      timeout: 20000
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
