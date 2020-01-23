const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const Helper = require("../v4/helper.js");
const BN = web3.utils.BN;

const MockDAO = artifacts.require("MockDAO.sol");
const FeeHandler = artifacts.require("FeeHandler.sol");
const Token = artifacts.require("Token.sol");
const BITS_PER_PARAM = 64;

let kyberNetwork;
let kyberNetworkProxy;
let user;
let mockDAO;
let knc;
let feeHandler;
let rewardInBPS;
let rebateInBPS;
let epoch;
let expiryBlockNumber;


contract('FeeHandler', function(accounts) {
    before("Setting global variables", async() => {
        kyberNetwork = accounts[0];
        user = accounts[0];
        kyberNetworkProxy = accounts[1];
        rewardInBPS = new BN(3000);
        rebateInBPS = new BN(5000);
        epoch = new BN(0);
        expiryBlockNumber = new BN(5);
        mockDAO = await MockDAO.new(
            rewardInBPS,
            rebateInBPS,
            epoch,
            expiryBlockNumber
        );
        knc = await Token.new("KyberNetworkCrystal", "KNC", 18);
        feeHandler = await FeeHandler.new(mockDAO.address, kyberNetworkProxy, kyberNetwork, knc.address, 5);
    });
    // Test encode
    it("Test encode function", async function() {
        let expectedEncodedData = rewardInBPS.shln(BITS_PER_PARAM).add(rebateInBPS).shln(BITS_PER_PARAM).add(epoch).shln(BITS_PER_PARAM).add(expiryBlockNumber);
        let actualEncodedData = await feeHandler.brrAndEpochData();
        Helper.assertEqual(expectedEncodedData, actualEncodedData, "Actual encoded data is not correct");
    });
    // Test decode

    // Test handleFees
    // Test claimStakerReward
    // Test claimReserveRebate


})