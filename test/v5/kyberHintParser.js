const KyberHintParser = artifacts.require('KyberHintParser.sol');
const Helper = require('../v4/helper.js');
const BN = web3.utils.BN;

const precisionUnits = new BN(10).pow(new BN(18));
const ethDecimals = new BN(18);
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const zeroAddress = '0x0000000000000000000000000000000000000000';
const gasPrice = new BN(10).pow(new BN(9)).mul(new BN(50));

const SEPARATOR_OPCODE = '0x00';
const MASK_IN_OPCODE = '0x01';
const MASK_OUT_OPCODE = '0x02';
const SPLIT_TRADE_OPCODE = '0x03';
const END_OPCODE = '0xaa';

let hintParser;

contract('KyberHintParser', function(accounts) {
    it('should init hint parser', async function () {
        hintParser = await KyberHintParser.new();
    });

    it('test globals', async() => {
        const separator = await hintParser.SEPARATOR();
        Helper.assertEqual(separator, SEPARATOR_OPCODE);

        const maskIn = await hintParser.MASK_IN_OPCODE();
        Helper.assertEqual(maskIn, MASK_IN_OPCODE);

        const maskOut = await hintParser.MASK_OUT_OPCODE();
        Helper.assertEqual(maskOut, MASK_OUT_OPCODE);

        const splitTrade = await hintParser.SPLIT_TRADE_OPCODE();
        Helper.assertEqual(splitTrade, SPLIT_TRADE_OPCODE);

        const end = await hintParser.END_OPCODE();
        Helper.assertEqual(end, END_OPCODE);
    });

    describe("test building various hints", function() {
        it('should build the e2t hint for mask in', async() => {
            let e2tOpcode = MASK_IN_OPCODE;
            let e2tReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let e2tSplits = [];
            let t2eOpcode = '0x';
            let t2eReserves = [];
            let t2eSplits = [];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = '0x';
            expectedResult = expectedResult.concat(encodeReserveInfo(t2eOpcode, t2eReserves, t2eSplits));
            expectedResult = expectedResult.concat(SEPARATOR_OPCODE.substr(2));
            expectedResult = expectedResult.concat(encodeReserveInfo(e2tOpcode, e2tReserves, e2tSplits));
            expectedResult = expectedResult.concat(END_OPCODE.substr(2));
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should build the e2t hint for mask out', async() => {
            let e2tOpcode = MASK_OUT_OPCODE;
            let e2tReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let e2tSplits = [];
            let t2eOpcode = '0x';
            let t2eReserves = [];
            let t2eSplits = [];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = '0x';
            expectedResult = expectedResult.concat(encodeReserveInfo(t2eOpcode, t2eReserves, t2eSplits));
            expectedResult = expectedResult.concat(SEPARATOR_OPCODE.substr(2));
            expectedResult = expectedResult.concat(encodeReserveInfo(e2tOpcode, e2tReserves, e2tSplits));
            expectedResult = expectedResult.concat(END_OPCODE.substr(2));
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should build the e2t hint for splits', async() => {
            let e2tOpcode = SPLIT_TRADE_OPCODE;
            let e2tReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let e2tSplits = [new BN(3000), new BN(7000)];
            let t2eOpcode = '0x';
            let t2eReserves = [];
            let t2eSplits = [];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = buildHint(e2tOpcode, e2tReserves, e2tSplits, t2eOpcode, t2eReserves, t2eSplits);
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should revert the e2t hint for splits', async() => {
            let e2tOpcode = SPLIT_TRADE_OPCODE;
            let e2tReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let e2tSplits = [new BN(5000), new BN(6000)]; // more than 100bps
            let t2eOpcode = '0x';
            let t2eReserves = [];
            let t2eSplits = [];
    
            try {
                await hintParser.buildHint(
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                )
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });

        it('should build the t2e hint for mask in', async() => {
            let e2tOpcode = '0x';
            let e2tReserves = [];
            let e2tSplits = [];
            let t2eOpcode = MASK_IN_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = '0x';
            expectedResult = expectedResult.concat(encodeReserveInfo(t2eOpcode, t2eReserves, t2eSplits));
            expectedResult = expectedResult.concat(SEPARATOR_OPCODE.substr(2));
            expectedResult = expectedResult.concat(encodeReserveInfo(e2tOpcode, e2tReserves, e2tSplits));
            expectedResult = expectedResult.concat(END_OPCODE.substr(2));
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should build the t2e hint for mask out', async() => {
            let e2tOpcode = '0x';
            let e2tReserves = [];
            let e2tSplits = [];
            let t2eOpcode = MASK_OUT_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = '0x';
            expectedResult = expectedResult.concat(encodeReserveInfo(t2eOpcode, t2eReserves, t2eSplits));
            expectedResult = expectedResult.concat(SEPARATOR_OPCODE.substr(2));
            expectedResult = expectedResult.concat(encodeReserveInfo(e2tOpcode, e2tReserves, e2tSplits));
            expectedResult = expectedResult.concat(END_OPCODE.substr(2));
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should build the t2e hint for splits', async() => {
            let e2tOpcode = '0x';
            let e2tReserves = [];
            let e2tSplits = [];
            let t2eOpcode = SPLIT_TRADE_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [new BN(3000), new BN(7000)];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = buildHint(e2tOpcode, e2tReserves, e2tSplits, t2eOpcode, t2eReserves, t2eSplits);
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should revert the t2e hint for splits', async() => {
            let e2tOpcode = '0x';
            let e2tReserves = [];
            let e2tSplits = [];
            let t2eOpcode = SPLIT_TRADE_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
    
            try {
                await hintParser.buildHint(
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                )
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });

        it('should build the t2t hint for both mask in', async() => {
            let e2tOpcode = MASK_IN_OPCODE;
            let e2tReserves = ['0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D', '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F'];
            let e2tSplits = [];
            let t2eOpcode = MASK_IN_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = '0x';
            expectedResult = expectedResult.concat(encodeReserveInfo(t2eOpcode, t2eReserves, t2eSplits));
            expectedResult = expectedResult.concat(SEPARATOR_OPCODE.substr(2));
            expectedResult = expectedResult.concat(encodeReserveInfo(e2tOpcode, e2tReserves, e2tSplits));
            expectedResult = expectedResult.concat(END_OPCODE.substr(2));
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should build the t2t hint for mask in, mask out', async() => {
            let e2tOpcode = MASK_IN_OPCODE;
            let e2tReserves = ['0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D', '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F'];
            let e2tSplits = [];
            let t2eOpcode = MASK_OUT_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = '0x';
            expectedResult = expectedResult.concat(encodeReserveInfo(t2eOpcode, t2eReserves, t2eSplits));
            expectedResult = expectedResult.concat(SEPARATOR_OPCODE.substr(2));
            expectedResult = expectedResult.concat(encodeReserveInfo(e2tOpcode, e2tReserves, e2tSplits));
            expectedResult = expectedResult.concat(END_OPCODE.substr(2));
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should build the t2t hint for mask in, splits', async() => {
            let e2tOpcode = MASK_IN_OPCODE;
            let e2tReserves = ['0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D', '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F'];
            let e2tSplits = [];
            let t2eOpcode = SPLIT_TRADE_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [new BN(3000), new BN(7000)];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = buildHint(e2tOpcode, e2tReserves, e2tSplits, t2eOpcode, t2eReserves, t2eSplits);
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should revert the t2t hint for mask in, splits', async() => {
            let e2tOpcode = MASK_IN_OPCODE;
            let e2tReserves = ['0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D', '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F'];
            let e2tSplits = [];
            let t2eOpcode = SPLIT_TRADE_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
    
            try {
                await hintParser.buildHint(
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                )
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });

        it('should build the t2t hint for mask out, mask in', async() => {
            let e2tOpcode = MASK_OUT_OPCODE;
            let e2tReserves = ['0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D', '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F'];
            let e2tSplits = [];
            let t2eOpcode = MASK_IN_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = '0x';
            expectedResult = expectedResult.concat(encodeReserveInfo(t2eOpcode, t2eReserves, t2eSplits));
            expectedResult = expectedResult.concat(SEPARATOR_OPCODE.substr(2));
            expectedResult = expectedResult.concat(encodeReserveInfo(e2tOpcode, e2tReserves, e2tSplits));
            expectedResult = expectedResult.concat(END_OPCODE.substr(2));
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should build the t2t hint for both mask out', async() => {
            let e2tOpcode = MASK_OUT_OPCODE;
            let e2tReserves = ['0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D', '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F'];
            let e2tSplits = [];
            let t2eOpcode = MASK_OUT_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = '0x';
            expectedResult = expectedResult.concat(encodeReserveInfo(t2eOpcode, t2eReserves, t2eSplits));
            expectedResult = expectedResult.concat(SEPARATOR_OPCODE.substr(2));
            expectedResult = expectedResult.concat(encodeReserveInfo(e2tOpcode, e2tReserves, e2tSplits));
            expectedResult = expectedResult.concat(END_OPCODE.substr(2));
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should build the t2t hint for mask out, splits', async() => {
            let e2tOpcode = MASK_OUT_OPCODE;
            let e2tReserves = ['0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D', '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F'];
            let e2tSplits = [];
            let t2eOpcode = SPLIT_TRADE_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [new BN(3000), new BN(7000)];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = buildHint(e2tOpcode, e2tReserves, e2tSplits, t2eOpcode, t2eReserves, t2eSplits);
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should revert the t2t hint for mask out, splits', async() => {
            let e2tOpcode = MASK_OUT_OPCODE;
            let e2tReserves = ['0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D', '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F'];
            let e2tSplits = [];
            let t2eOpcode = SPLIT_TRADE_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
    
            try {
                await hintParser.buildHint(
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                )
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });

        it('should build the t2t hint for splits, mask in', async() => {
            let e2tOpcode = SPLIT_TRADE_OPCODE;
            let e2tReserves = ['0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D', '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F'];
            let e2tSplits = [new BN(3000), new BN(7000)];
            let t2eOpcode = MASK_IN_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = '0x';
            expectedResult = expectedResult.concat(encodeReserveInfo(t2eOpcode, t2eReserves, t2eSplits));
            expectedResult = expectedResult.concat(SEPARATOR_OPCODE.substr(2));
            expectedResult = expectedResult.concat(encodeReserveInfo(e2tOpcode, e2tReserves, e2tSplits));
            expectedResult = expectedResult.concat(END_OPCODE.substr(2));
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should build the t2t hint for splits, mask out', async() => {
            let e2tOpcode = SPLIT_TRADE_OPCODE;
            let e2tReserves = ['0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D', '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F'];
            let e2tSplits = [new BN(3000), new BN(7000)];
            let t2eOpcode = MASK_OUT_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = '0x';
            expectedResult = expectedResult.concat(encodeReserveInfo(t2eOpcode, t2eReserves, t2eSplits));
            expectedResult = expectedResult.concat(SEPARATOR_OPCODE.substr(2));
            expectedResult = expectedResult.concat(encodeReserveInfo(e2tOpcode, e2tReserves, e2tSplits));
            expectedResult = expectedResult.concat(END_OPCODE.substr(2));
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should build the t2t hint for both splits', async() => {
            let e2tOpcode = SPLIT_TRADE_OPCODE;
            let e2tReserves = ['0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D', '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F'];
            let e2tSplits = [new BN(5000), new BN(5000)];
            let t2eOpcode = SPLIT_TRADE_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [new BN(3000), new BN(7000)];
    
            const hintResult = await hintParser.buildHint(
                e2tOpcode,
                e2tReserves,
                e2tSplits,
                t2eOpcode,
                t2eReserves,
                t2eSplits,
            )
    
            let expectedResult = buildHint(e2tOpcode, e2tReserves, e2tSplits, t2eOpcode, t2eReserves, t2eSplits);
    
            Helper.assertEqual(hintResult, expectedResult);
        });

        it('should revert the t2t hint for both splits', async() => {
            let e2tOpcode = SPLIT_TRADE_OPCODE;
            let e2tReserves = ['0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D', '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F'];
            let e2tSplits = [new BN(5000), new BN(5000)];
            let t2eOpcode = SPLIT_TRADE_OPCODE;
            let t2eReserves = ['0x63825c174ab367968EC60f061753D3bbD36A0D8F', '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D'];
            let t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
    
            try {
                await hintParser.buildHint(
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                )
                assert(false, "throw was expected in line above.")
            } catch(e){
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });
    });
})

function buildHint(e2tOpcode, e2tReserves, e2tSplits, t2eOpcode, t2eReserves, t2eSplits) {
    let hint = '0x';
    hint = hint.concat(encodeReserveInfo(t2eOpcode, t2eReserves, t2eSplits));
    hint = hint.concat(SEPARATOR_OPCODE.substr(2));
    hint = hint.concat(encodeReserveInfo(e2tOpcode, e2tReserves, e2tSplits));
    hint = hint.concat(END_OPCODE.substr(2));

    return hint;
}
function encodeReserveInfo(opcode, reserves, bps) {
    let result = '';
    if (reserves.length > 0) {
        result = result.concat(opcode.substr(2));
        result = result.concat(`0${reserves.length.toString(16)}`.slice(-2));
        for (var i = 0; i < reserves.length; i++) {
            result = result.concat(web3.utils.toChecksumAddress(reserves[i]).substr(2));
            if (opcode === SPLIT_TRADE_OPCODE) {
                result = result.concat(`0000${bps[i].toString(16)}`.slice(-4));
            }
        }
    }

    return result;
}
