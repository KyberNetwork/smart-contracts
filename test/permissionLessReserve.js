let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let PermissionLessReserve = artifacts.require("./PermissionLessReserve.sol");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
//////////////////
let precisionUnits = (new BigNumber(10).pow(18));
let ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
let precision = new BigNumber(10).pow(18);

//balances
let expectedReserveBalanceWei = 0;
let reserveTokenBalance = [];

//permission groups
let admin;
let networkAddress;
let withDrawAddress;

//contracts
let reserveInst;

//tokens data
////////////
let numTokens = 5;
let tokens = [];
let tokenAdd = [];
let KNCToken;
let kncAddress;

//addresses
let user1;
let user2;
let maker1;
let maker2;

let currentBlock;

contract('PermissionLessReserve', function(accounts) {
    it("should init globals. init tokens and add to reserve.", async function () {
        // set account addresses
        admin = accounts[0];
        networkAddress = accounts[1];
        maker1 = accounts[2];
        maker2 = accounts[3];
        user1 = accounts[4];
        user2 = accounts[5];
        withDrawAddress = accounts[6];

        currentBlock = await Helper.getCurrentBlock();

        //create and add token addresses...
        for (let i = 0; i < numTokens; ++i) {
            token = await TestToken.new("test" + i, "tst" + i, 18);
            tokens[i] = token;
            tokenAdd[i] = token.address;
        }

        KNCToken = await TestToken.new("Kyber Crystals", "KNC", 18);
        kncAddress = KNCToken.address;

        reserveInst = await PermissionLessReserve.new(networkAddress, admin, kncAddress);

        assert.equal(tokens.length, numTokens, "bad number tokens");
    });

    it("maker add tokens, ethers, validate was added", async function () {
//        makerDepositTokens(address maker, ERC20 token, uint amountTwei) public {
        let token = tokens[0];
        let amountTwei = 5 * 10 ** 19;
        let amountKnc = 5 * 10 ** 18;

        await token.transfer(maker1, amountTwei); //500 tokens
        await token.approve(reserveInst.address, amountTwei, {from: maker1});
        await reserveInst.makerDepositTokens(maker1, token.address, amountTwei, {from: maker1});

//        let makerFundsKey = await twoStringsSoliditySha(maker1, token.address);
//        let rxNumTwei = await reserveInst.remainingFundsPerToken(makerFundsKey);
        let rxNumTwei = await reserveInst.getMakerFreeFunds(maker1, token.address);
        assert.equal(rxNumTwei.valueOf(), amountTwei);

//        makerDepositKnc(address maker, uint128 amountTwei) public payable {
        await KNCToken.transfer(maker1, amountKnc);
        await KNCToken.approve(reserveInst.address, amountKnc, {from: maker1});
        await reserveInst.makerDepositKnc(maker1, amountKnc, {from: maker1});

        let rxKncTwei = await reserveInst.getMakerFreeKNC(maker1);
        assert.equal(rxKncTwei.valueOf(), amountKnc);

        rxKncTwei = await reserveInst.getMakerStakedKNC(maker1);
        assert.equal(rxKncTwei.valueOf(), 0);

        //makerDepositEther
        
    });

    it("maker add order. see funds updated. see order added. get orders list", async function () {
    });


    it("maker add 2 orders. see funds updated. see order added. get orders list", async function () {
    });

});


async function twoStringsSoliditySha(str1, str2) {
    let str1Cut = str1.slice(2);
    let str2Cut = str2.slice(2);
    let combinedSTR = str1Cut + str2Cut;

    // Convert a string to a byte array
    for (var bytes = [], c = 0; c < combinedSTR.length; c += 2)
        bytes.push(parseInt(combinedSTR.substr(c, 2), 16));

    let sha3Res = await web3.sha3(bytes);

    return sha3Res;
};

function addBps (price, bps) {
    return (price.mul(10000 + bps).div(10000));
};

function compareRates (receivedRate, expectedRate) {
    expectedRate = expectedRate - (expectedRate % 10);
    receivedRate = receivedRate - (receivedRate % 10);
    assert.equal(expectedRate, receivedRate, "different prices");
};


function calcDstQty(srcQty, srcDecimals, dstDecimals, rate) {
    rate = new BigNumber(rate);
    if (dstDecimals >= srcDecimals) {
        let decimalDiff = (new BigNumber(10)).pow(dstDecimals - srcDecimals);
        return (rate.mul(srcQty).mul(decimalDiff).div(precisionUnits)).floor();
    } else {
        let decimalDiff = (new BigNumber(10)).pow(srcDecimals - dstDecimals);
        return (rate.mul(srcQty).div(decimalDiff.mul(precisionUnits))).floor();
    }
}

