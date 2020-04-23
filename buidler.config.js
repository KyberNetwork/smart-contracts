usePlugin("@nomiclabs/buidler-truffle5");
usePlugin("@nomiclabs/buidler-web3");

module.exports = {
  defaultNetwork: "buidlerevm",

  networks: {
    develop: {
      url: "http://127.0.0.1:8545",
      gas: 6000000,
      timeout: 20000
    }
  },

  solc: {
    version: "0.6.6",
    optimizer: require("./solcOptimiserSettings.js")
  },

  paths: {
    sources: "./contracts/sol6",
    tests: "./test/sol6",
  },

  mocha: {
    enableTimeouts: false
  }
};