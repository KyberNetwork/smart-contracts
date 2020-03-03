const WrapperBase = artifacts.require("WrapperBase.sol");
const PermissionGroups = artifacts.require("PermissionGroups.sol");

const Helper = require("../helper.js");
const BN = web3.utils.BN;

const precisionUnits = (new BN(10)).pow(new BN(18));

//global variables
let admin;
let alerter;
let operator1;
let operator2;
let operator3;

let wrapper;
let wrapped;

contract('WrapperBase', function(accounts) {
    before("init globals.", async function () {
        deployer = accounts[0];
        operator1 = accounts[1];
        operator2 = accounts[2];
        alerter1 = accounts[4];
        alerter2 = accounts[5];
        admin = accounts[6];
    });

    beforeEach("init WrapperBase and Wrapped contract.", async function () {
        wrapped = await PermissionGroups.new();
        wrapper = await WrapperBase.new(wrapped.address, {from: admin});
        await wrapped.transferAdminQuickly(wrapper.address, {from: deployer});
    });

    it("transfer wrapped contract admin and claim.", async function () {
        let rxAdmin = await wrapped.admin();
        assert.equal(rxAdmin, wrapper.address);

        await wrapper.transferWrappedContractAdmin(deployer, {from: admin});
        await wrapped.claimAdmin({from: deployer});

        rxAdmin = await wrapped.admin();
        assert.equal(rxAdmin, deployer);

        await wrapped.transferAdmin(wrapper.address);
        await wrapper.claimWrappedContractAdmin({from: admin});

        rxAdmin = await wrapped.admin();
        assert.equal(rxAdmin, wrapper.address);
    });

    it("add / remove wrapped contract operator.", async function () {
        let rxOperators = await wrapped.getOperators();

        assert.equal(rxOperators.length, 0);

        await wrapper.addOperatorWrappedContract(operator1, {from: admin});
        rxOperators = await wrapped.getOperators();

        assert.equal(rxOperators.length, 1);
        assert.equal(rxOperators[0], operator1);

        await wrapper.addOperatorWrappedContract(operator2, {from: admin});
        rxOperators = await wrapped.getOperators();

        assert.equal(rxOperators.length, 2);
        assert.equal(rxOperators[0], operator1);
        assert.equal(rxOperators[1], operator2);

        await wrapper.removeOperatorWrappedContract(operator1, {from: admin});
        rxOperators = await wrapped.getOperators();

        assert.equal(rxOperators.length, 1);
        assert.equal(rxOperators[0], operator2);
    });

    it("add / remove wrapped contract alerter.", async function () {
        let rxAlerters = await wrapped.getAlerters();

        assert.equal(rxAlerters.length, 0);

        await wrapper.addAlerterWrappedContract(alerter1, {from: admin});
        rxAlerters = await wrapped.getAlerters();

        assert.equal(rxAlerters.length, 1);
        assert.equal(rxAlerters[0], alerter1);

        await wrapper.addAlerterWrappedContract(alerter2, {from: admin});
        rxAlerters = await wrapped.getAlerters();

        assert.equal(rxAlerters.length, 2);
        assert.equal(rxAlerters[0], alerter1);
        assert.equal(rxAlerters[1], alerter2);

        await wrapper.removeAlerterWrappedContract(alerter1, {from: admin});
        rxAlerters = await wrapped.getAlerters();

        assert.equal(rxAlerters.length, 1);
        assert.equal(rxAlerters[0], alerter2);
    });

    it("verify transfer / claim wrapped admin actions on wrapped contract. blocked for wrapper non admin.", async function() {
        try {
            await wrapper.transferWrappedContractAdmin(deployer, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see working with admin
        await wrapper.transferWrappedContractAdmin(deployer, {from: admin});
        await wrapped.claimAdmin({from: deployer});

        rxAdmin = await wrapped.admin();
        assert.equal(rxAdmin, deployer);

        await wrapped.transferAdmin(wrapper.address);
        try {
            await wrapper.claimWrappedContractAdmin({from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // see working with admin
        await wrapper.claimWrappedContractAdmin({from: admin});
    });

    it("verify operator related actions on wrapped contract. blocked for wrapper non admin.", async function() {
        try {
            await wrapper.addOperatorWrappedContract(operator1, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see working with admin
        await wrapper.addOperatorWrappedContract(operator1, {from: admin});

        try {
            await wrapper.removeOperatorWrappedContract(operator1, {from: operator1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // see working with admin
        await wrapper.removeOperatorWrappedContract(operator1, {from: admin});
    });


    it("verify alerter related actions on wrapped contract. blocked for wrapper non admin.", async function() {
        try {
            await wrapper.addAlerterWrappedContract(alerter1, {from: alerter1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //see working with admin
        await wrapper.addAlerterWrappedContract(alerter1, {from: admin});

        try {
            await wrapper.removeAlerterWrappedContract(alerter1, {from: alerter1});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        // see working with admin
        await wrapper.removeAlerterWrappedContract(alerter1, {from: admin});
    });
});

function log(str) {
    console.log(str);
}