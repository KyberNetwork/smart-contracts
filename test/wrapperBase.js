//let eeBurner = artifacts.require("./FeeBurner.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let WrapperBase = artifacts.require("./wrapperContracts/MockWrapperBase.sol");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

let wrapperInst;
let amdin;
let operator1;
let operator2;
let operator3;
let numDataInstances = 1;
let nonce = 0;
let index = 0;

let wrappedContract;
contract('WrapFeeBurner', function(accounts) {
    it("should init wrapper base and set general parameters.", async function () {
        admin = accounts[0];
        operator1 = accounts[1];
        operator2 = accounts[2];
        operator3 = accounts[3];

        wrappedContract = accounts[4];

        wrapperInst = await WrapperBase.new(wrappedContract, admin, numDataInstances);
        await wrapperInst.addOperator(operator1);
        await wrapperInst.addOperator(operator2);
    });

    it("should test set new data. legal and illegal inputs", async function () {
        let data = 55;
        await wrapperInst.mockSetNewData(data, index, {from: operator1});
        nonce++;
        let illegalIndex = 1;

        let rxData = await wrapperInst.data();
        assert.equal(rxData.valueOf(), data);

        let rxTrackingData = await wrapperInst.mockGetDataTrackingParameters(index);
        assert.equal(rxTrackingData[1].valueOf(), nonce);

        try {
            await wrapperInst.mockSetNewData((data * 2), illegalIndex, {from: operator1});
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        rxData = await wrapperInst.data();
        assert.equal(rxData.valueOf(), data);

        rxTrackingData = await wrapperInst.mockGetDataTrackingParameters(index);
        assert.equal(rxTrackingData[1].valueOf(), nonce);
    });


    it("should test get data. legal and illegal inputs", async function () {
        let data = 55;
        await wrapperInst.mockSetNewData(data, index, {from: operator1});
        nonce++;
        let illegalIndex = 1;

        let rxTrackingData = await wrapperInst.mockGetDataTrackingParameters(index);
        assert.equal(rxTrackingData[1].valueOf(), nonce);

        try {
            rxTrackingData = await wrapperInst.mockGetDataTrackingParameters(illegalIndex);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should test add signature. legal and illegal inputs", async function () {
        await wrapperInst.mockAddSignature(index, nonce, operator1);

        //can't sign twice
        try {
            await wrapperInst.mockAddSignature(index, nonce, operator1);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        let wrongNonce = nonce - 1;

        //can't sign wrong nonce
        try {
            await wrapperInst.mockAddSignature(index, wrongNonce, operator2);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }


        //can't sign bad index
        let illegalIndex = 1;

        try {
            await wrapperInst.mockAddSignature(illegalIndex, nonce, operator2);
            assert(false, "throw was expected in line above.")
        }
        catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        allSigned = await wrapperInst.mockAddSignature(index, nonce, operator2);
//        assert.equal(allSigned.valueOf(), true);
    });
});