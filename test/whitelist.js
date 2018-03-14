let WhiteList = artifacts.require("./WhiteList.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");

let admin;
let operator;
let kgtToken;
let kgtHolder;
let kgtCategory;
let user1;
let user2;

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

let whiteListInst;
let sgdToEthRateInWei;
let defaultUserCapSgd = 1000;
let oneSgdToEther = 0.0010352;

contract('WhiteList', function(accounts) {
    it("should init globals.", async function () {
        admin = accounts[0];
        operator = accounts[8];
        kgtHolder = accounts[7];
        user1 = accounts[3];
        user2 = accounts[4];

        kgtToken = await TestToken.new("Kyber genesis token", "KGT", 0);
        sgdToEthRateInWei = (((new BigNumber(10)).pow(18)).mul(oneSgdToEther));
        whiteListInst = await WhiteList.new(admin, kgtToken.address);
        await whiteListInst.addOperator(operator, {from: admin});
        await whiteListInst.setSgdToEthRate(sgdToEthRateInWei, {from : operator});

        kgtCategory = await whiteListInst.kgtHolderCategory();

        // set defaultUserCapSgd SGD cap for category 0 which is the default for all users.
        await whiteListInst.setCategoryCap(0, defaultUserCapSgd, {from : operator});
    });

    it("should verify the default cap for non set user.", async function () {
        let userCap = await whiteListInst.getUserCapInWei(user1);
//        console.log("user1" + user1 + " userCap" + userCap);
        let expectedUserCapWei = sgdToEthRateInWei.mul(defaultUserCapSgd);
        assert.equal(userCap.valueOf(), expectedUserCapWei, "unexpected user cap");
    });

    it("should verify the cap for user with unique category.", async function () {
        await whiteListInst.setCategoryCap(17, 2000, {from : operator});
        await whiteListInst.setUserCategory(user2, 17, {from : operator});
        userCap = await whiteListInst.getUserCapInWei(user2);
        let expectedUserCapWei = sgdToEthRateInWei.mul(2000);
        assert.equal(userCap.valueOf(), expectedUserCapWei, "unexpected user cap");
    });

    it("should verify the category for kgt holder with no set category.", async function () {
        assert.equal(kgtCategory.valueOf(), 2, "unexpected kgt holder category");

        //get non kgt holder category
        let userCategory = await whiteListInst.getUserCategory(kgtHolder);
        assert.equal(userCategory.valueOf(), 0, "Unexpected category");

        //make this user kgt holder by tx kgt token to user.
        await kgtToken.transfer(kgtHolder, 1);

        //get user category when kgt holder
        userCategory = await whiteListInst.getUserCategory(kgtHolder);
        assert.equal(userCategory.valueOf(), kgtCategory, "Unexpected category");
    });

    it("should verify if kgt Holder has set category. being KGT holder has no affect.", async function () {
        //get user category when kgt holder
        let userCategory = await whiteListInst.getUserCategory(kgtHolder);
        assert.equal(userCategory.valueOf(), kgtCategory, "Unexpected category");

        //set another user category to this KGT holder
        await whiteListInst.setUserCategory(kgtHolder, 6, {from : operator});

        //get user category
        userCategory = await whiteListInst.getUserCategory(kgtHolder);
        assert.equal(userCategory.valueOf(), 6, "Unexpected category");

        //set kgt holder cat back to 0 and see he gets kgt holder cat
        await whiteListInst.setUserCategory(kgtHolder, 0, {from : operator});
        userCategory = await whiteListInst.getUserCategory(kgtHolder);
        assert.equal(userCategory.valueOf(), kgtCategory, "Unexpected category");
    });

    it("should verify the cap for kgt holder with non set category.", async function () {
        let kgtHolderCap = 750;

        await whiteListInst.setCategoryCap(kgtCategory, kgtHolderCap, {from : operator});

        //get user cap as kgt holder
        let userCap = await whiteListInst.getUserCapInWei(kgtHolder);
        assert.equal(userCap.valueOf(), sgdToEthRateInWei.mul(kgtHolderCap).valueOf(), "user cap should be " + kgtHolderCap);

        //make this user non kgt holder
        let balance = await kgtToken.balanceOf(kgtHolder);
        await kgtToken.transfer(admin, balance, {from: kgtHolder});

        //get user cap when not kgt holder
        userCap = await whiteListInst.getUserCapInWei(kgtHolder);
        assert.equal(userCap, sgdToEthRateInWei.mul(defaultUserCapSgd).valueOf(), "user cap should be 0");
    });

    it("should verify the cap for user with uninit category is 0.", async function () {
        await whiteListInst.setUserCategory(user2, 25, {from : operator});
        userCap = await whiteListInst.getUserCapInWei(user2);
        assert.equal(userCap.valueOf(), 0, "unexpected user cap");
    });

    it("should test when sgdtoWei not init, cap is always 0.", async function () {
        let whiteListInst2 = await WhiteList.new(admin, kgtToken.address);
        await whiteListInst2.addOperator(operator, {from: admin});
        //tests unset user
        userCap = await whiteListInst.getUserCapInWei(user2);
        assert.equal(0, userCap.valueOf(), "unexpected user cap");

        //set specific user cap
        await whiteListInst2.setCategoryCap(17, 2000, {from : operator});
        await whiteListInst2.setUserCategory(user2, 17, {from : operator});
        userCap = await whiteListInst2.getUserCapInWei(user2);
        assert.equal(0, userCap.valueOf(), "unexpected user cap");
    });

    it("should test when no category is init, cap is always 0.", async function () {
        let whiteListInst2 = await WhiteList.new(admin, kgtToken.address);
        await whiteListInst2.addOperator(operator, {from: admin});

        //tests unset user
        userCap = await whiteListInst2.getUserCapInWei(user2);
        assert.equal(0, userCap.valueOf(), "unexpected user cap");

        //set specific user cap
        await whiteListInst2.setUserCategory(user2, 17, {from : operator});
        userCap = await whiteListInst2.getUserCapInWei(user2);
        assert.equal(0, userCap.valueOf(), "unexpected user cap");
    });

    it("should test can't init this contract with empty addresses (address 0).", async function () {
        let list;

        try {
            list = await WhiteList.new(0, kgtToken.address);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        try {
            list = await WhiteList.new(admin, 0);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        list = await WhiteList.new(admin, kgtToken.address);
    });
});
