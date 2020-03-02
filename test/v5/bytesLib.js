const TestBytesLib1 = artifacts.require('TestBytesLib1.sol');
const TestBytesLib2 = artifacts.require('TestBytesLib2.sol');
const AssertBool = artifacts.require('AssertBool.sol');
const AssertUint = artifacts.require('AssertUint.sol');
const Helper = require('../v4/helper.js');

let assertBool;
let assertUint;
let test;

contract('BytesLib', function(accounts) {
    before('one time init, libraries', async() => {
        assertBool = await AssertBool.new();
        assertUint = await AssertUint.new();
    });

    describe("running TestBytesLib1.sol", function() {
        it('should init TestBytesLib1', async function () {
            TestBytesLib1.link(assertUint);
            test = await TestBytesLib1.new();
        });

        it('run solidity test testSanityCheck', async function () {
            await test.testSanityCheck();
            // todo: Detect failing events
            // await Helper.expectEvent(test.testSanityCheck());
            // console.log(test.decodeLogs);
            // let logs = test.events.TestEvent.processReceipt(await test.testSanityCheck());
            // console.log(logs);
        });

        it('run solidity test testMemoryIntegrityCheck4Bytes', async function () {
            await test.testMemoryIntegrityCheck4Bytes();
        });

        it('run solidity test testMemoryIntegrityCheck31Bytes', async function () {
            await test.testMemoryIntegrityCheck31Bytes();
        });

        it('run solidity test testMemoryIntegrityCheck32Bytes', async function () {
            await test.testMemoryIntegrityCheck32Bytes();
        });

        it('run solidity test testMemoryIntegrityCheck33Bytes', async function () {
            await test.testMemoryIntegrityCheck33Bytes();
        });

        it('run solidity test testConcatMemory4Bytes', async function () {
            await test.testConcatMemory4Bytes();
        });

        it('run solidity test testConcatMemory31Bytes', async function () {
            await test.testConcatMemory31Bytes();
        });

        it('run solidity test testConcatMemory32Bytes', async function () {
            await test.testConcatMemory32Bytes();
        });

        it('run solidity test testConcatMemory33Bytes', async function () {
            await test.testConcatMemory33Bytes();
        });
    });

    describe("running TestBytesLib2.sol", function() {
        it('should init TestBytesLib2', async function () {
            TestBytesLib2.link(assertBool);
            TestBytesLib2.link(assertUint);
            test = await TestBytesLib2.new();
        });

        it('run solidity test testSanityCheck', async function () {
            await test.testSanityCheck();
        });

        it('run solidity test testSlice', async function () {
            await test.testSlice();
        });

        it('run solidity test testToUint8', async function () {
            await test.testToUint8();
        });

        it('run solidity test testToUint16', async function () {
            await test.testToUint16();
        });
    });
})
