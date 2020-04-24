module.exports = {
  solc: {
    version: "0.5.11",
    optimizer: require("./solcOptimiserSettings.js")
  },

  paths: {
    sources: "./contracts/sol5",
    artifacts: ".coverageArtifacts"
  }
};
