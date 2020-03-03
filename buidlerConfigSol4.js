module.exports = {
  defaultNetwork: "buidlerevm",
  solc: {
    version: "0.4.18",
    optimizer: require("./solcOptimiserSettings.js")
  },

  paths: {
    sources: "./contracts"
  }
};
