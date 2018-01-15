let WhiteList = artifacts.require("./WhiteList.sol")

<<<<<<< HEAD
let admin;

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

=======
let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

>>>>>>> 62b31ba... change all var to let in js files.
let whiteListInst;
let sgdToEthRateInWei;
let defaultUserCapSgd = 1000;
let oneSgdToEther = 0.0010352;

contract('WhiteList', function(accounts) {
    it("should init globals.", async function () {
        admin = accounts[0];
        sgdToEthRateInWei = (((new BigNumber(10)).pow(18)).mul(oneSgdToEther));
        whiteListInst = await WhiteList.new(admin);
        await whiteListInst.addOperator(accounts[8], {from: admin});
        await whiteListInst.setSgdToEthRate(sgdToEthRateInWei, {from : accounts[8]});

        // set defaultUserCapSgd SGD cap for category 0 which is the default for all users.
        await whiteListInst.setCategoryCap(0, defaultUserCapSgd, {from : accounts[8]});
    });

    it("should verify the default cap for non set user.", async function () {
        let userCap = await whiteListInst.getUserCapInWei(accounts[3]);
        let expectedUserCapWei = sgdToEthRateInWei.mul(defaultUserCapSgd);
        assert.equal(userCap.valueOf(), expectedUserCapWei, "unexpected user cap");
        userCap = await whiteListInst.getUserCapInWei(accounts[4]);
        assert.equal(userCap.valueOf(), expectedUserCapWei, "unexpected user cap");
    });

    it("should verify the cap for user with unique category.", async function () {
        await whiteListInst.setCategoryCap(17, 2000, {from : accounts[8]});
        await whiteListInst.setUserCategory(accounts[4], 17, {from : accounts[8]});
        userCap = await whiteListInst.getUserCapInWei(accounts[4]);
        let expectedUserCapWei = sgdToEthRateInWei.mul(2000);
        assert.equal(userCap.valueOf(), expectedUserCapWei, "unexpected user cap");
    });

    it("should verify the cap for user with uninit category is 0.", async function () {
        await whiteListInst.setUserCategory(accounts[4], 25, {from : accounts[8]});
        userCap = await whiteListInst.getUserCapInWei(accounts[4]);
        assert.equal(userCap.valueOf(), 0, "unexpected user cap");
    });

    it("should test when sgdtoWei not init, cap is always 0.", async function () {
        let whiteListInst2 = await WhiteList.new(admin);
        await whiteListInst2.addOperator(accounts[8], {from: admin});
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
        let whiteListInst2 = await WhiteList.new(admin);
        await whiteListInst2.addOperator(accounts[8], {from: admin});
        //tests unset user
        userCap = await whiteListInst2.getUserCapInWei(accounts[4]);
        assert.equal(0, userCap.valueOf(), "unexpected user cap");

        //set specific user cap
        await whiteListInst2.setUserCategory(accounts[4], 17, {from : accounts[8]});
        userCap = await whiteListInst2.getUserCapInWei(accounts[4]);
        assert.equal(0, userCap.valueOf(), "unexpected user cap");
    });

    it("should test can't init this contract with empty contracts (address 0).", async function () {
        let list;

        try {
           sanityRatess = await WhiteList.new(0);
           assert(false, "throw was expected in line above.")
        } catch(e){
           assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        sanityRatess = await WhiteList.new(admin);
    });
});
