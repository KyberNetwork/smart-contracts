var Withdrawable = artifacts.require("./Withdrawable.sol");
var TestToken = artifacts.require("./TestToken.sol");
var KyberWhiteList = artifacts.require("./KyberWhiteList.sol")

var Helper = require("./helper.js");
var BigNumber = require('bignumber.js');

var token;
var whiteListInst;
var sgdToEthRateInWei;
var defaultUserCapSgd = 1000;
var oneSgdToEther = 0.0010352;

contract('KyberWhiteList', function(accounts) {
    it("should init globals.", async function () {
        sgdToEthRateInWei = (((new BigNumber(10)).pow(18)).mul(oneSgdToEther));
        whiteListInst = await KyberWhiteList.new(accounts[0]);
        await whiteListInst.addOperator(accounts[8], {from: accounts[0]});
        await whiteListInst.setSgdToEthRate(sgdToEthRateInWei, {from : accounts[8]});

        // set defaultUserCapSgd SGD cap for category 0 which is the default for all users.
        await whiteListInst.setCategoryCap(0, defaultUserCapSgd, {from : accounts[8]});
    });
    it("should verify the default cap for non set user.", async function () {
        var userCap = await whiteListInst.getUserCapInWei(accounts[3]);
        var expectedUserCapWei = sgdToEthRateInWei.mul(defaultUserCapSgd);
        assert.equal(userCap.valueOf(), expectedUserCapWei, "unexpected user cap");
        userCap = await whiteListInst.getUserCapInWei(accounts[4]);
        assert.equal(userCap.valueOf(), expectedUserCapWei, "unexpected user cap");
    });
    it("should verify the cap for user with unique category.", async function () {
        await whiteListInst.setCategoryCap(17, 2000, {from : accounts[8]});
        await whiteListInst.setUserCategory(accounts[4], 17, {from : accounts[8]});
        userCap = await whiteListInst.getUserCapInWei(accounts[4]);
        var expectedUserCapWei = sgdToEthRateInWei.mul(2000);
        console.log(" expectedUserCapWei " + expectedUserCapWei);
        assert.equal(userCap.valueOf(), expectedUserCapWei, "unexpected user cap");
    });
    it("should verify the cap for user with uninit category is 0.", async function () {
        await whiteListInst.setUserCategory(accounts[4], 25, {from : accounts[8]});
        userCap = await whiteListInst.getUserCapInWei(accounts[4]);
        assert.equal(userCap.valueOf(), 0, "unexpected user cap");
    });
    it("should test when sgdtoWei not init, cap is always 0.", async function () {
        var whiteListInst2 = await KyberWhiteList.new(accounts[0]);
        await whiteListInst2.addOperator(accounts[8], {from: accounts[0]});
        //tests unset user
        userCap = await whiteListInst.getUserCapInWei(accounts[4]);
        assert.equal(0, userCap.valueOf(), "unexpected user cap");

        //set specific user cap
        await whiteListInst2.setCategoryCap(17, 2000, {from : accounts[8]});
        await whiteListInst2.setUserCategory(accounts[4], 17, {from : accounts[8]});
        userCap = await whiteListInst2.getUserCapInWei(accounts[4]);
        assert.equal(0, userCap.valueOf(), "unexpected user cap");
    });
    it("should test when no category is init, cap is always 0.", async function () {
        var whiteListInst2 = await KyberWhiteList.new(accounts[0]);
        await whiteListInst2.addOperator(accounts[8], {from: accounts[0]});
        //tests unset user
        userCap = await whiteListInst2.getUserCapInWei(accounts[4]);
        assert.equal(0, userCap.valueOf(), "unexpected user cap");

        //set specific user cap
        await whiteListInst2.setUserCategory(accounts[4], 17, {from : accounts[8]});
        userCap = await whiteListInst2.getUserCapInWei(accounts[4]);
        assert.equal(0, userCap.valueOf(), "unexpected user cap");
    });

});
