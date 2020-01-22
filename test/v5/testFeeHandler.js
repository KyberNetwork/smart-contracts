const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

let MockDAO = artifacts.require("MockDAO.sol");
let FeeHandler = artifacts.require("FeeHandler.sol");