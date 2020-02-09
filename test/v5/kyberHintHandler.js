const MockHintHandler = artifacts.require('MockHintHandler.sol');
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
const END_OPCODE = '0xee';
const MASK_IN_HINTTYPE = 0;
const MASK_OUT_HINTTYPE = 1;
const SPLIT_HINTTYPE = 2;

let hintHandler;
let mockTradeLogic;
let admin;
let e2tOpcode;
let e2tReserves;
let e2tSplits;
let e2tHintType
let t2eOpcode;
let t2eReserves;
let t2eSplits;
let t2eHintType;
let hint;

contract('KyberHintHandler', function(accounts) {
    before('one time init, admin account', async() => {
        admin = accounts[0];
    });

    it('should init hint parser', async function () {
        hintHandler = await MockHintHandler.new();
    });

    it('should init reserveAddressToId and reserveIdToAddresses mappings', async function () {
        const reserves = [
            '0x63825c174ab367968EC60f061753D3bbD36A0D8F',
            '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D',
            '0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D',
            '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F',
            '0x75ff6bec6ed398fa80ea1596cef422d64681f057'
        ];
        const ids = [
            '0xff00000063820D8F',
            '0xff0000007a334F7D',
            '0xaa00000016709A5D',
            '0xaa00000031E04C7F',
            '0xcc00000075fff057',
        ]

        for (var i = 0; i < reserves.length; i++) {
            await hintHandler.addReserve(reserves[i], ids[i]);
        }
    });

    it('test globals', async() => {
        const separator = await hintHandler.SEPARATOR_OPCODE();
        Helper.assertEqual(separator, SEPARATOR_OPCODE);

        const maskIn = await hintHandler.MASK_IN_OPCODE();
        Helper.assertEqual(maskIn, MASK_IN_OPCODE);

        const maskOut = await hintHandler.MASK_OUT_OPCODE();
        Helper.assertEqual(maskOut, MASK_OUT_OPCODE);

        const splitTrade = await hintHandler.SPLIT_TRADE_OPCODE();
        Helper.assertEqual(splitTrade, SPLIT_TRADE_OPCODE);

        const end = await hintHandler.END_OPCODE();
        Helper.assertEqual(end, END_OPCODE);
    });

    describe("test building various hints", function() {
        describe("e2t", function() {
            before('one time init of vars', async() => {
                e2tReserves = ['0xff00000063820D8F', '0xaa00000016709A5D'];
            });

            it('should build the e2t hint for mask in', async() => {
                e2tOpcode = MASK_IN_HINTTYPE;
                e2tSplits = [];
                
                const hintResult = await hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                const expectedResult = builde2tHint(e2tOpcode, e2tReserves, e2tSplits);                
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should build the e2t hint for mask out', async() => {
                e2tOpcode = MASK_OUT_HINTTYPE;
                e2tSplits = [];
        
                const hintResult = await hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                const expectedResult = builde2tHint(e2tOpcode, e2tReserves, e2tSplits);
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should build the e2t hint for splits', async() => {
                e2tOpcode = SPLIT_HINTTYPE;
                e2tSplits = [new BN(3000), new BN(7000)];
        
                const hintResult = await hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                const expectedResult = builde2tHint(e2tOpcode, e2tReserves, e2tSplits);
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should revert the e2t hint for splits due to >10000bps', async() => {
                e2tOpcode = SPLIT_HINTTYPE;
                e2tSplits = [new BN(5000), new BN(6000)]; // more than 100bps
        
                try {
                    await hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("t2e", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff0000007a334F7D', '0xcc00000075fff057'];
            });

            it('should build the t2e hint for mask in', async() => {
                t2eOpcode = MASK_IN_HINTTYPE;
                t2eSplits = [];
        
                const hintResult = await hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);
                const expectedResult = buildt2eHint(t2eOpcode, t2eReserves, t2eSplits);                
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should build the t2e hint for mask out', async() => {
                t2eOpcode = MASK_OUT_HINTTYPE;
                t2eSplits = [];
        
                const hintResult = await hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);
                const expectedResult = buildt2eHint(t2eOpcode, t2eReserves, t2eSplits);
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should build the t2e hint for splits', async() => {
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
        
                const hintResult = await hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);
                const expectedResult = buildt2eHint(t2eOpcode, t2eReserves, t2eSplits);
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should revert the t2e hint for splits due to >10000bps', async() => {
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
        
                try {
                    await hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("t2t", function() {
            before('one time init of vars', async() => {
                e2tReserves = ['0xff00000063820D8F', '0xaa00000016709A5D'];
                t2eReserves = ['0xff0000007a334F7D', '0xcc00000075fff057'];
            });

            it('should build the t2t hint for both mask in', async() => {
                e2tOpcode = MASK_IN_HINTTYPE;
                e2tSplits = [];
                t2eOpcode = MASK_IN_HINTTYPE;
                t2eSplits = [];
        
                const hintResult = await hintHandler.buildTokenToTokenHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
                const expectedResult = buildt2tHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should build the t2t hint for mask in, mask out', async() => {
                e2tOpcode = MASK_IN_HINTTYPE;
                e2tSplits = [];
                t2eOpcode = MASK_OUT_HINTTYPE;
                t2eSplits = [];
        
                const hintResult = await hintHandler.buildTokenToTokenHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
                const expectedResult = buildt2tHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should build the t2t hint for mask in, splits', async() => {
                e2tOpcode = MASK_IN_HINTTYPE;
                e2tSplits = [];
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
        
                const hintResult = await hintHandler.buildTokenToTokenHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
                const expectedResult = buildt2tHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should revert the t2t hint for mask in, splits due to >10000bps', async() => {
                e2tOpcode = MASK_IN_HINTTYPE;
                e2tSplits = [];
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
        
                try {
                    await hintHandler.buildTokenToTokenHint(
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
    
            it('should build the t2t hint for mask out, mask in', async() => {
                e2tOpcode = MASK_OUT_HINTTYPE;
                e2tSplits = [];
                t2eOpcode = MASK_IN_HINTTYPE;
                t2eSplits = [];
        
                const hintResult = await hintHandler.buildTokenToTokenHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
                const expectedResult = buildt2tHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should build the t2t hint for both mask out', async() => {
                e2tOpcode = MASK_OUT_HINTTYPE;
                e2tSplits = [];
                t2eOpcode = MASK_OUT_HINTTYPE;
                t2eSplits = [];
        
                const hintResult = await hintHandler.buildTokenToTokenHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
                const expectedResult = buildt2tHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should build the t2t hint for mask out, splits', async() => {
                e2tOpcode = MASK_OUT_HINTTYPE;
                e2tSplits = [];
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
        
                const hintResult = await hintHandler.buildTokenToTokenHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
                const expectedResult = buildt2tHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should revert the t2t hint for mask out, splits due to >10000bps', async() => {
                e2tOpcode = MASK_OUT_HINTTYPE;
                e2tSplits = [];
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps            
        
                try {
                    await hintHandler.buildTokenToTokenHint(
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
    
            it('should build the t2t hint for splits, mask in', async() => {
                e2tOpcode = SPLIT_HINTTYPE;
                e2tSplits = [new BN(3000), new BN(7000)];
                t2eOpcode = MASK_IN_HINTTYPE;
                t2eSplits = [];
        
                const hintResult = await hintHandler.buildTokenToTokenHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
                const expectedResult = buildt2tHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should build the t2t hint for splits, mask out', async() => {
                e2tOpcode = SPLIT_HINTTYPE;
                e2tSplits = [new BN(3000), new BN(7000)];
                t2eOpcode = MASK_OUT_HINTTYPE;
                t2eSplits = [];
        
                const hintResult = await hintHandler.buildTokenToTokenHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
                const expectedResult = buildt2tHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should build the t2t hint for both splits', async() => {
                e2tOpcode = SPLIT_HINTTYPE;
                e2tSplits = [new BN(5000), new BN(5000)];
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
        
                const hintResult = await hintHandler.buildTokenToTokenHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
                const expectedResult = buildt2tHint(
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should revert the t2t hint for both splits due to >10000bps', async() => {
                e2tOpcode = SPLIT_HINTTYPE;
                e2tSplits = [new BN(5000), new BN(5000)];
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
        
                try {
                    await hintHandler.buildTokenToTokenHint(
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });
    });

    describe("test parsing various hints", function() {
        describe("e2t", function() {
            before('one time init of vars', async() => {
                e2tReserves = ['0xff00000063820d8f', '0xaa00000016709a5d'];
            });

            it('should parse the e2t hint for mask in', async() => {
                e2tHintType = MASK_IN_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x000102ff00000063820D8Faa00000016709A5Dee';
        
                const parseResult = await hintHandler.parseEthToTokenHint(hint);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
            });
    
            it('should parse the e2t hint for mask out', async() => {
                e2tHintType = MASK_OUT_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x000202ff00000063820d8faa00000016709a5dee';
        
                const parseResult = await hintHandler.parseEthToTokenHint(hint);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
            });
    
            it('should parse the e2t hint for splits', async() => {
                e2tHintType = SPLIT_HINTTYPE;
                e2tSplits = [new BN(3000), new BN(7000)];
                hint = '0x000302ff00000063820d8f0bb8aa00000016709a5d1b58ee';
        
                const parseResult = await hintHandler.parseEthToTokenHint(hint);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
            });

            it('should revert parsing the e2t hint for splits due to >10000bps', async() => {
                hint = '0x000302ff00000063820d8f1388aa00000016709a5d1770ee';
    
                try {
                    await hintHandler.parseEthToTokenHint(hint);
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("t2e", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff0000007a334f7d', '0xcc00000075fff057'];
            });

            it('should parse the t2e hint for mask in', async() => {
                t2eHintType = MASK_IN_HINTTYPE;
                t2eSplits = [new BN(10000)];
                hint = '0x0102ff0000007a334f7dcc00000075fff05700ee';
        
                const parseResult = await hintHandler.parseTokenToEthHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
            });
    
            it('should parse the t2e hint for mask out', async() => {
                t2eHintType = MASK_OUT_HINTTYPE;
                t2eSplits = [new BN(10000)];
                hint = '0x0202ff0000007a334f7dcc00000075fff05700ee';
        
                const parseResult = await hintHandler.parseTokenToEthHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
            });
    
            it('should parse the t2e hint for splits', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
                hint = '0x0302ff0000007a334f7d0bb8cc00000075fff0571b5800ee';
        
                const parseResult = await hintHandler.parseTokenToEthHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
            });
    
            it('should revert parsing the t2e hint for splits due to >10000bps', async() => {
                hint = '0x0302ff0000007a334f7d1388cc00000075fff057177000ee';
    
                try {
                    await hintHandler.parseTokenToEthHint(hint);
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("t2t", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff0000007a334f7d', '0xcc00000075fff057'];
                e2tReserves = ['0xff00000063820d8f', '0xaa00000016709a5d'];
            });

            it('should parse the t2t hint for both mask in', async() => {
                t2eHintType = MASK_IN_HINTTYPE;
                t2eSplits = [new BN(10000)];
                e2tHintType = MASK_IN_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x0102ff0000007a334f7dcc00000075fff057000102ff00000063820d8faa00000016709a5dee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
            });
    
            it('should parse the t2t hint for mask in, mask out', async() => {
                t2eHintType = MASK_OUT_HINTTYPE;
                t2eSplits = [new BN(10000)];
                e2tHintType = MASK_IN_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x0202ff0000007a334f7dcc00000075fff057000102ff00000063820d8faa00000016709a5dee';
                
                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
            });
    
            it('should parse the t2t hint for mask in, splits', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
                e2tHintType = MASK_IN_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x0302ff0000007a334f7d0bb8cc00000075fff0571b58000102ff00000063820d8faa00000016709a5dee';
                
                const parseResult = await hintHandler.parseTokenToTokenHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
            });
    
            it('should revert parsing the t2t hint for mask in, splits due to >10000bps', async() => {
                hint = '0x0302ff0000007a334f7d1388cc00000075fff0571770000102ff00000063820d8faa00000016709a5dee';
                
                try {
                    await hintHandler.parseTokenToTokenHint(hint);
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
    
            it('should parse the t2t hint for mask out, mask in', async() => {
                t2eHintType = MASK_IN_HINTTYPE;
                t2eSplits = [new BN(10000)];
                e2tHintType = MASK_OUT_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x0102ff0000007a334f7dcc00000075fff057000202ff00000063820d8faa00000016709a5dee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
            });
    
            it('should parse the t2t hint for both mask out', async() => {
                t2eHintType = MASK_OUT_HINTTYPE;
                t2eSplits = [new BN(10000)];
                e2tHintType = MASK_OUT_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x0202ff0000007a334f7dcc00000075fff057000202ff00000063820d8faa00000016709a5dee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
            });
    
            it('should parse the t2t hint for mask out, splits', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
                e2tHintType = MASK_OUT_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x0302ff0000007a334f7d0bb8cc00000075fff0571b58000202ff00000063820d8faa00000016709a5dee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
            });
    
            it('should revert parsing the t2t hint for mask out, splits due to >10000bps', async() => {
                hint = '0x0302ff0000007a334f7d1388cc00000075fff0571770000202ff00000063820d8faa00000016709a5dee';
                
                try {
                    await hintHandler.parseTokenToTokenHint(hint);
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }        
            });
    
            it('should parse the t2t hint for splits, mask in', async() => {
                t2eHintType = MASK_IN_HINTTYPE;
                t2eSplits = [new BN(10000)];        
                e2tHintType = SPLIT_HINTTYPE;
                e2tSplits = [new BN(3000), new BN(7000)];
                hint = '0x0102ff0000007a334f7dcc00000075fff057000302ff00000063820d8f0bb8aa00000016709a5d1b58ee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
            });
    
            it('should parse the t2t hint for splits, mask out', async() => {
                e2tHintType = SPLIT_HINTTYPE;
                e2tSplits = [new BN(3000), new BN(7000)];
                t2eHintType = MASK_OUT_HINTTYPE;
                t2eSplits = [new BN(10000)];
                hint = '0x0202ff0000007a334f7dcc00000075fff057000302ff00000063820d8f0bb8aa00000016709a5d1b58ee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
            });
    
            it('should parse the t2t hint for both splits', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
                e2tHintType = SPLIT_HINTTYPE;
                e2tSplits = [new BN(5000), new BN(5000)];
                hint = '0x0302ff0000007a334f7d0bb8cc00000075fff0571b58000302ff00000063820d8f1388aa00000016709a5d1388ee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
            });
    
            it('should revert parsing the t2t hint for both splits due to >10000bps', async() => {
                hint = '0x0302ff0000007a334f7d1338cc00000075fff0571770000302ff00000063820d8f1388aa00000016709a5d1388ee';

                try {
                    await hintHandler.parseTokenToTokenHint(hint);
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }  
            });
        });
    });
})

function parseOpcode(opcode) {
    switch (opcode) {
        case MASK_IN_HINTTYPE:
            return MASK_IN_OPCODE;
            break;
        case MASK_OUT_HINTTYPE:
            return MASK_OUT_OPCODE;
            break;
        case SPLIT_HINTTYPE:
            return SPLIT_TRADE_OPCODE;
            break;
        default:
            break;
    }
}

function builde2tHint(e2tOpcode, e2tReserves, e2tSplits) {
    let hint = '0x';
    hint = hint.concat(SEPARATOR_OPCODE.substr(2));
    hint = hint.concat(encodeReserveInfo(parseOpcode(e2tOpcode), e2tReserves, e2tSplits));
    hint = hint.concat(END_OPCODE.substr(2));

    return hint;
}

function buildt2eHint(t2eOpcode, t2eReserves, t2eSplits) {
    let hint = '0x';
    hint = hint.concat(encodeReserveInfo(parseOpcode(t2eOpcode), t2eReserves, t2eSplits));
    hint = hint.concat(SEPARATOR_OPCODE.substr(2));
    hint = hint.concat(END_OPCODE.substr(2));

    return hint;
}

function buildt2tHint(t2eOpcode, t2eReserves, t2eSplits, e2tOpcode, e2tReserves, e2tSplits) {
    let hint = '0x';
    hint = hint.concat(encodeReserveInfo(parseOpcode(t2eOpcode), t2eReserves, t2eSplits));
    hint = hint.concat(SEPARATOR_OPCODE.substr(2));
    hint = hint.concat(encodeReserveInfo(parseOpcode(e2tOpcode), e2tReserves, e2tSplits));
    hint = hint.concat(END_OPCODE.substr(2));

    return hint;
}

function encodeReserveInfo(opcode, reserveIds, bps) {
    let result = '';
    if (reserveIds.length > 0) {
        result = result.concat(opcode.substr(2));
        result = result.concat(`0${reserveIds.length.toString(16)}`.slice(-2));
        for (var i = 0; i < reserveIds.length; i++) {
            result = result.concat(reserveIds[i].substr(2));
            if (opcode === SPLIT_TRADE_OPCODE) {
                result = result.concat(`0000${bps[i].toString(16)}`.slice(-4));
            }
        }
    }

    return result;
}
