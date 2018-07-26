let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let MockOtc = artifacts.require("./mockContracts/MockOtc.sol");
let MockOasisDirectProxy = artifacts.require("./mockContracts/MockOasisDirectProxy.sol");
let KyberFundlessReserve = artifacts.require("./KyberFundlessReserve");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
//////////////////
let ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
let precision = new BigNumber(10).pow(18);

contract('KyberFundlessReserve', function (accounts) {
    it("should init an otc", async function (){
        //global initialization in first test
        otc = await MockOtc.new();

        myWethToken = await TestToken.new("my weth token", "weth", 18);
        //let supply = await myWethToken.INITIAL_SUPPLY();
        //await myWethToken.transfer(centralBank.address, supply);

        myToken = await TestToken.new("my token", "weth", 18);
        //let supply = await myToken.INITIAL_SUPPLY();
        //await myToken.transfer(centralBank.address, supply);

        oasisDirectProxy = await MockOasisDirectProxy.new()

        //move weth and tokens to the oasis direct proxy
        let supply = await myWethToken.INITIAL_SUPPLY();
        await myWethToken.transfer(oasisDirectProxy.address, supply);

        supply = await myToken.INITIAL_SUPPLY();
        await myToken.transfer(oasisDirectProxy.address, supply);

        // use admin address as network
        admin = accounts[0]
        reserve = await KyberFundlessReserve.new(admin, oasisDirectProxy.address, otc.address, myWethToken.address, myToken.address, admin);

        // test get conversion rate
        srcQty = new BigNumber(10).pow(18); // 1 eth
        rate = await reserve.getConversionRate(ethAddress, myToken.address, srcQty, 0)
        rateInTokenUnits = rate.div(precision)
        console.log(rateInTokenUnits.toString())

        // test buy (eth->token)
        let balance = await Helper.getBalancePromise(admin);
        console.log("balance before trade: " + balance.toString())
        let tokenTweiBalance = await myToken.balanceOf(admin);
        console.log("tokenTweiBalance before trade: " + tokenTweiBalance.toString())

        await reserve.trade(ethAddress, srcQty, myToken.address, admin, rate, true, {value: srcQty});

        balance = await Helper.getBalancePromise(admin);
        console.log("balance after trade: " + balance.toString())
        tokenTweiBalance = await myToken.balanceOf(admin);
        console.log("tokenTweiBalance after trade: " + tokenTweiBalance.toString())
        /*
        Helper.sendEtherWithPromise(accounts[7], centralBank.address, 1000);
        myToken = await TestToken.new("my token", "tok", 18);
        let supply = await myToken.INITIAL_SUPPLY();
        await myToken.transfer(centralBank.address, supply);

        await Promise.all([centralBank.addOwner(accounts[2]), centralBank.addOwner(accounts[3])]);
        myExchange = await MockExchange.new("first name", centralBank.address);

        //start test
        await myExchange.addOwner(accounts[2]);

        let payable = await TestToken.new("dont use", "ban", 12);
        
        await myExchange.addMockDepositAddress(myToken.address, {from:accounts[2]});

        //withdraw with owner
        await myExchange.withdraw(myToken.address, 100, payable.address, {from:accounts[2]})
        let balance = await myToken.balanceOf(payable.address);
        assert.equal(balance.valueOf(), 100);
        */
    });
});