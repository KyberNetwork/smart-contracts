const Web3 = require('web3');
const TestToken = artifacts.require("Token.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const KyberNetwork = artifacts.require("KyberNetwork.sol");
const Helper = require("../v4/helper.js");

const BN = web3.utils.BN;

//global variables
//////////////////
const precisionUnits = (new BN(10).pow(new BN(18)));
const ethDecimals = new BN(18);
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const zeroAddress = '0x0000000000000000000000000000000000000000';
const gasPrice = (new BN(10).pow(new BN(9)).mul(new BN(50)));
const negligibleRateDiffBps = new BN(50); //0.05% 

let admin;
let alerter;
let network;
let networkProxy;
let feeHandler;
let operator;
let user;

//reserve data
//////////////
let numReserves = 3;
let reserves = [];
let reserve;
let reserveAddresses = [];
let isFeePaying = [];
let reserveEtherInit = new BN(10).pow(new BN(19)).mul(new BN(2));

//tokens data
////////////
let numTokens = 4;
let tokens = [];
let tokenAddresses = [];
let tokenDecimals = [];
let srcTokenId;
let destTokenId;
let srcToken;
let destToken;
let srcQty;

contract('KyberNetwork', function(accounts) {
    before("one time init", async() => {
        //init accounts
        admin = accounts[0];
        operator = accounts[1];
        alerter = accounts[2];
        user = accounts[3];
        networkProxy = accounts[3];
        feeHandler = accounts[4]; // to change to actual fee burner

        //init tokens
        for (let i = 0; i < numTokens; i++) {
            tokenDecimals[i] = new BN(15).add(new BN(i));
            token = await TestToken.new("test" + i, "tst" + i, tokenDecimals[i]);
            tokens[i] = token;
            tokenAddresses[i] = token.address;
        }

        //init reserves
        for (let i = 0; i < numReserves; i++) {
            tokensPerEther = precisionUnits.mul(new BN((i + 1) * 3));
            ethersPerToken = precisionUnits.div(new BN((i + 1) * 3));
            reserve = await MockReserve.new();
            reserves[i] = reserve;
            //send ETH
            await Helper.sendEtherWithPromise(accounts[9], reserve.address, reserveEtherInit);
            await assertSameEtherBalance(reserve, reserveEtherInit);
            for (let j = 0; j < numTokens; j++) {
                //set rates and send tokens based on eth -> token rate
                await reserve.setRate(tokenAddresses[j], tokensPerEther, ethersPerToken);
                let initialTokenAmount = Helper.calcDstQty(reserveEtherInit, ethDecimals, tokenDecimals[j], tokensPerEther);
                await tokens[j].transfer(reserve.address, initialTokenAmount);
                await assertSameTokenBalance(reserve, tokens[j], initialTokenAmount);
            }
            reserveAddresses[i] = reserve.address;
            //randomise fee paying
            isFeePaying[i] = (Math.random() >= 0.5);
        }

        //init network
        network = await KyberNetwork.new(admin);
        await network.addOperator(operator);
        await network.setKyberProxy(networkProxy);
        await network.setFeeHandler(feeHandler);

        for (let i = 0; i < numReserves; i++) {
            reserve = reserves[i];
            network.addReserve(reserve.address, new BN(i+1), isFeePaying[i], reserve.address, {from: operator});
            for (let j = 0; j < numTokens; j++) {
                network.listPairForReserve(reserve.address, tokenAddresses[j], true, true, true, {from: operator});
            }
        }
        await network.setParams(gasPrice, negligibleRateDiffBps);
        await network.setEnable(true);
    });

    beforeEach("running before each test", async() => {
        srcTokenId = 0;
        destTokenId = 0;
        while (srcTokenId == destTokenId) {
            srcTokenId = getRandomInt(0,numTokens-1);
            destTokenId = getRandomInt(0,numTokens-1);
        }
        
        srcToken = tokens[srcTokenId];
        destToken = tokens[destTokenId];
        srcDecimals = tokenDecimals[srcTokenId];
        destDecimals = tokenDecimals[destTokenId];

        srcQty = new BN(1000).mul(new BN(10).pow(srcDecimals));
    })

    it("should test enable API", async() => {
        let isEnabled = await network.enabled();
        assert.equal(isEnabled, true);

        await network.setEnable(false);

        isEnabled = await network.enabled();
        assert.equal(isEnabled, false);

        await network.setEnable(true);
    });

    it("should get best rate for some token to another", async() => {
        srcQty = precisionUnits;
        let takerFeesBps = new BN(25);
        result = await network.searchBestRate(reserveAddresses, ethAddress, destToken.address, srcQty, takerFeesBps);
        result = await network.searchBestRate(reserveAddresses, srcToken.address, ethAddress, srcQty, takerFeesBps);
    });

    it("should get expected rate for some token", async() => {
        result = await network.getExpectedRate(srcToken.address, ethAddress, srcQty);
        result = await network.getExpectedRate(srcToken.address, destToken.address, srcQty);
    });

    it("should perform a token -> ETH trade and check balances change as expected", async() => {
        initialUserTokenBalance = await srcToken.balanceOf(user);
        initialUserETHBalance = await 
    });
})

async function assertSameEtherBalance(account, expectedBalance) {
    let balance = await Helper.getBalancePromise(account.address);
    Helper.assertEqual(balance, expectedBalance, "wrong ether balance");
}

async function assertSameTokenBalance(account, token, expectedBalance) {
    let balance = await token.balanceOf(account.address);
    Helper.assertEqual(balance, expectedBalance, "wrong token balance");
}

//returns random integer between min (inclusive) and max (inclusive)
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
