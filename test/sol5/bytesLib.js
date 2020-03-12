const abi = require('web3-eth-abi');
const TestBytesLib1 = artifacts.require('TestBytesLib1.sol');
const TestBytesLib2 = artifacts.require('TestBytesLib2.sol');
const AssertBool = artifacts.require('AssertBool.sol');
const AssertUint = artifacts.require('AssertUint.sol');
const Helper = require('../helper.js');

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
            checkSolidityTest(await test.testSanityCheck());
        });

        it('run solidity test testMemoryIntegrityCheck4Bytes', async function () {
            checkSolidityTest(await test.testMemoryIntegrityCheck4Bytes());
        });

        it('run solidity test testMemoryIntegrityCheck31Bytes', async function () {
            checkSolidityTest(await test.testMemoryIntegrityCheck31Bytes());
        });

        it('run solidity test testMemoryIntegrityCheck32Bytes', async function () {
            checkSolidityTest(await test.testMemoryIntegrityCheck32Bytes());
        });

        it('run solidity test testMemoryIntegrityCheck33Bytes', async function () {
            checkSolidityTest(await test.testMemoryIntegrityCheck33Bytes());
        });

        it('run solidity test testConcatMemory4Bytes', async function () {
            checkSolidityTest(await test.testConcatMemory4Bytes());
        });

        it('run solidity test testConcatMemory31Bytes', async function () {
            checkSolidityTest(await test.testConcatMemory31Bytes());
        });

        it('run solidity test testConcatMemory32Bytes', async function () {
            checkSolidityTest(await test.testConcatMemory32Bytes());
        });

        it('run solidity test testConcatMemory33Bytes', async function () {
            checkSolidityTest(await test.testConcatMemory33Bytes());
        });
    });

    describe("running TestBytesLib2.sol", function() {
        it('should init TestBytesLib2', async function () {
            TestBytesLib2.link(assertBool);
            TestBytesLib2.link(assertUint);
            test = await TestBytesLib2.new();
        });

        it('run solidity test testSanityCheck', async function () {
            checkSolidityTest(await test.testSanityCheck());
        });

        it('run solidity test testSlice', async function () {
            checkSolidityTest(await test.testSlice());
        });

        it('run solidity test testToUint8', async function () {
            await test.testToUint8();
        });

        it('run solidity test testToUint16', async function () {
            checkSolidityTest(await test.testToUint16());
        });
    });
})

function checkSolidityTest(result) {
    const logs = [];
    const signature = web3.utils.sha3("TestEvent(bool,string)");

    for (const log of result.receipt.rawLogs) {
        if (log.topics.length === 2 && log.topics[0] === signature) {
            const decoded = {
                event: "TestEvent",
                args: {
                    result: abi.decodeLog(["bool"], log.topics[1], log.topics)[0],
                    message: abi.decodeLog(["string"], log.data, log.topics)[0]
                }
            };
            logs.push(decoded);
        }
    }
    
    for (const log of logs) {
        if (log.event === "TestEvent" && !log.args.result) {
            throw new Error(log.args.message);
        }
    }
}