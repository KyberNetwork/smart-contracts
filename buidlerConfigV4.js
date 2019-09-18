usePlugin("@nomiclabs/buidler-truffle4");
usePlugin("@nomiclabs/buidler-web3-legacy");

module.exports = {
  defaultNetwork: "develop",

  networks: {
    develop: {
      gas: 6000000
    }
  },

  solc: {
    version: "0.4.18",
    optimizer: {
      enabled: true,
      runs: 200
    }
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },

  mocha: {
    enableTimeouts: false
  }
};
