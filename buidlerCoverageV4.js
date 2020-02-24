module.exports = {
  defaultNetwork: "buidlerevm",
  solc: {
    version: "0.4.18",
    optimizer: {
      enabled: true,
      runs: 200
    }
  },

  paths: {
    sources: "./contracts",
    artifacts: ".coverageV4Artifacts"
  }
};
