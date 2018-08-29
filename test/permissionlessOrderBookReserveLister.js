let TestToken = artifacts.require("./mockContracts/TestToken.sol");
//let OrderBookReserve = artifacts.require("./OrderBookReserve.sol");
let OrderBookReserve = artifacts.require("./permissionless/mock/MockOrderBookReserve.sol");
let KyberNetwork = artifacts.require("./KyberNetwork.sol");
let PermissionlessOrderBookReserveReserveLister = artifacts.require("./PermissionlessOrderBookReserveReserveLister.sol");
let FeeBurner = artifacts.require("./FeeBurner.sol");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
//////////////////
let precisionUnits = (new BigNumber(10).pow(18));
let ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
let precision = new BigNumber(10).pow(18);

let withDrawAddress;

//contracts
let reserve;
let feeBurner;
let whiteList;
let expectedRate;
let kyberProxy;
let reserveLister;

//tokens data
////////////
let token;
let tokenAdd;
let KNCToken;
let kncAddress;
let kgtToken;

let gasPrice = (new BigNumber(10).pow(9).mul(50));
let negligibleRateDiff = 11;

//addresses
let admin;

let init = true;

let currentBlock;

contract('PermissionlessOrderBookReserveReserveLister', async (accounts) => {

    beforeEach('setup contract for each test', async () => {

        if(init) {
            //below should happen once
            admin = accounts[0];
            whiteList = accounts[1];
            expectedRate = accounts[2];
            kyberProxy = accounts[3];

            token = await TestToken.new("the token", "TOK", 18);
            tokenAdd = token.address;

            KNCToken = await TestToken.new("Kyber Crystals", "KNC", 18);
            kncAddress = KNCToken.address;

            currentBlock = await Helper.getCurrentBlock();
            init = false;
        }
    });


    it("init internal network and reserveLister. see init success.", async function () {
        network = await KyberNetwork.new(admin)

        feeBurner = await FeeBurner.new(admin, kncAddress, network.address);

        //set contracts
        await network.setKyberProxy(kyberProxy);
        await network.setWhiteList(whiteList);
        await network.setExpectedRate(expectedRate);
        await network.setFeeBurner(feeBurner.address);
        await network.setParams(gasPrice.valueOf(), negligibleRateDiff);
        await network.setEnable(true);

        reserveLister = await PermissionlessOrderBookReserveReserveLister.new(network.address, kncAddress);
//
//        let kyberAdd = await reserveLister.kyberContract();
//        assert.equal(kyberAdd.valueOf(), network.address);
//
//        let rxKnc = await reserveLister.kncToken();
//        assert.equal(rxKnc.valueOf(), kncAddress);
//
//        await network.addOperator(reserveLister.address);
    });

    it("create new permission less reserve and verify it was created.", async function () {

        let rxReserve = await reserveLister.getOrderBookReserveForToken(tokenAdd);
        assert(rxReserve.valueOf() == 0);

        await reserveLister.addOrderBookReserve(tokenAdd);

        //get new reserve
        rxReserve = await reserveLister.getOrderBookReserveForToken(tokenAdd);
        log ("reserve "+ rxReserve.valueOf());

        assert(rxReserve.valueOf() != 0);

        //verify can't create another reserve for same token

        try {
            await reserveLister.addOrderBookReserve(tokenAdd);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        rxReserve = await reserveLister.getOrderBookReserveForToken(tokenAdd);
        assert(rxReserve.valueOf() != 0);

        reserve = await OrderBookReserve.at(rxReserve.valueOf());

        let rxToken = await reserve.reserveToken();
        assert.equal(rxToken.valueOf(), tokenAdd);

        let rxKnc = await reserve.kncToken();
        assert.equal(rxKnc.valueOf(), kncAddress);
    });
});


function log(str) {
    console.log(str);
}

async function makerDeposit(maker, ethWei, tokenTwei, kncTwei) {

    await token.approve(reserve.address, tokenTwei);
    await reserve.makerDepositTokens(maker, tokenTwei);
    await KNCToken.approve(reserve.address, kncTwei);
    await reserve.makerDepositKnc(maker, kncTwei);
    await reserve.makerDepositEthers(maker, {from: maker, value: ethWei});
}

async function twoStringsSoliditySha(str1, str2) {
    let str1Cut = str1.slice(2);
    let str2Cut = str2.slice(2);
    let combinedSTR = str1Cut + str2Cut;

    // Convert a string to a byte array
    for (var bytes = [], c = 0; c < combinedSTR.length; c += 2)
        bytes.push(parseInt(combinedSTR.substr(c, 2), 16));

    let sha3Res = await web3.sha3(bytes, {encoding: "hex"});

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

