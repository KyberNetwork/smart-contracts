usePlugin("@nomiclabs/buidler-truffle5");
usePlugin("@nomiclabs/buidler-web3");

module.exports = {
  defaultNetwork: "buidlerevm",

  solc: {
    version: "0.5.11",
    optimizer: {
      enabled: true,
      runs: 200
    }
  },

  paths: {
    sources: "./contractsV5",
    tests: "./test",
  },

  mocha: {
    enableTimeouts: false
  }
};
