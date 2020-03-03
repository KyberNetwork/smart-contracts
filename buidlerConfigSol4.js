module.exports = {
  defaultNetwork: "buidlerevm",
  solc: {
    version: "0.4.18",
    optimizer: {
      enabled: true,
      runs: 9000
    }
  },

  paths: {
    sources: "./contracts"
  }
};
