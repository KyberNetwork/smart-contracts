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
const END_OPCODE = '0xee';
const MASK_IN_HINTTYPE = 0;
const MASK_OUT_HINTTYPE = 1;
const SPLIT_HINTTYPE = 2;

let hintParser;
let e2tOpcode;
let e2tReserves;
let e2tSplits;
let e2tHintType
let t2eOpcode;
let t2eReserves;
let t2eSplits;
let t2eHintType;
let failingIndex;
let hint;

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
        describe("e2t", function() {
            before('one time init of vars', async() => {
                e2tReserves = ['0xff0000', '0xaa000f'];
            });

            it('should build the e2t hint for mask in', async() => {
                e2tOpcode = MASK_IN_HINTTYPE;
                e2tSplits = [];
                
                const hintResult = await hintParser.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                const expectedResult = builde2tHint(e2tOpcode, e2tReserves, e2tSplits);
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should build the e2t hint for mask out', async() => {
                e2tOpcode = MASK_OUT_HINTTYPE;
                e2tSplits = [];
        
                const hintResult = await hintParser.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                const expectedResult = builde2tHint(e2tOpcode, e2tReserves, e2tSplits);
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should build the e2t hint for splits', async() => {
                e2tOpcode = SPLIT_HINTTYPE;
                e2tSplits = [new BN(3000), new BN(7000)];
        
                const hintResult = await hintParser.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                const expectedResult = builde2tHint(e2tOpcode, e2tReserves, e2tSplits);
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should revert the e2t hint for splits', async() => {
                e2tOpcode = SPLIT_HINTTYPE;
                e2tSplits = [new BN(5000), new BN(6000)]; // more than 100bps
        
                try {
                    await hintParser.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("t2e", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff0000', '0xaa000f'];
            });

            it('should build the t2e hint for mask in', async() => {
                t2eOpcode = MASK_IN_HINTTYPE;
                t2eSplits = [];
        
                const hintResult = await hintParser.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);
                const expectedResult = buildt2eHint(t2eOpcode, t2eReserves, t2eSplits);
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should build the t2e hint for mask out', async() => {
                t2eOpcode = MASK_OUT_HINTTYPE;
                t2eSplits = [];
        
                const hintResult = await hintParser.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);
                const expectedResult = buildt2eHint(t2eOpcode, t2eReserves, t2eSplits);
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should build the t2e hint for splits', async() => {
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
        
                const hintResult = await hintParser.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);
                const expectedResult = buildt2eHint(t2eOpcode, t2eReserves, t2eSplits);
        
                Helper.assertEqual(hintResult, expectedResult);
            });
    
            it('should revert the t2e hint for splits', async() => {
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
        
                try {
                    await hintParser.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("t2t", function() {
            before('one time init of vars', async() => {
                e2tReserves = ['0xaa0005', '0xaa0034'];
                t2eReserves = ['0xff0000', '0xaa000f'];
            });

            it('should build the t2t hint for both mask in', async() => {
                e2tOpcode = MASK_IN_HINTTYPE;
                e2tSplits = [];
                t2eOpcode = MASK_IN_HINTTYPE;
                t2eSplits = [];
        
                const hintResult = await hintParser.buildTokenToTokenHint(
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
        
                const hintResult = await hintParser.buildTokenToTokenHint(
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
        
                const hintResult = await hintParser.buildTokenToTokenHint(
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
    
            it('should revert the t2t hint for mask in, splits', async() => {
                e2tOpcode = MASK_IN_HINTTYPE;
                e2tSplits = [];
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
        
                try {
                    await hintParser.buildTokenToTokenHint(
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
        
                const hintResult = await hintParser.buildTokenToTokenHint(
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
        
                const hintResult = await hintParser.buildTokenToTokenHint(
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
        
                const hintResult = await hintParser.buildTokenToTokenHint(
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
    
            it('should revert the t2t hint for mask out, splits', async() => {
                e2tOpcode = MASK_OUT_HINTTYPE;
                e2tSplits = [];
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps            
        
                try {
                    await hintParser.buildTokenToTokenHint(
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
        
                const hintResult = await hintParser.buildTokenToTokenHint(
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
        
                const hintResult = await hintParser.buildTokenToTokenHint(
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
        
                const hintResult = await hintParser.buildTokenToTokenHint(
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
    
            it('should revert the t2t hint for both splits', async() => {
                e2tOpcode = SPLIT_HINTTYPE;
                e2tSplits = [new BN(5000), new BN(5000)];
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
        
                try {
                    await hintParser.buildTokenToTokenHint(
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
                e2tReserves = ['0xff0000', '0xaa000f'];
                failingIndex = new BN(0);
            });

            it('should parse the e2t hint for mask in', async() => {
                e2tHintType = MASK_IN_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x000102ff0000aa000fee';
        
                const parseResult = await hintParser.parseEthToTokenHint(hint);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0
            });
    
            it('should parse the e2t hint for mask out', async() => {
                e2tHintType = MASK_OUT_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x000202ff0000aa000fee';
        
                const parseResult = await hintParser.parseEthToTokenHint(hint);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0
            });
    
            it('should parse the e2t hint for splits', async() => {
                e2tHintType = SPLIT_HINTTYPE;
                e2tSplits = [new BN(3000), new BN(7000)];
                hint = '0x000302ff00000bb8aa000f1b58ee';
        
                const parseResult = await hintParser.parseEthToTokenHint(hint);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0
            });

            it('should revert parsing the e2t hint for splits', async() => {
                e2tHintType = SPLIT_HINTTYPE;
                e2tSplits = [new BN(5000), new BN(6000)]; // more than 100bps
                hint = '0x000302ff00001388aa000f1770ee';
    
                try {
                    await hintParser.parseEthToTokenHint(hint);
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("t2e", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff0000', '0xaa000f'];
                failingIndex = new BN(0);
            });

            it('should parse the t2e hint for mask in', async() => {
                t2eHintType = MASK_IN_HINTTYPE;
                t2eSplits = [new BN(10000)];
                hint = '0x0102ff0000aa000f00ee';
        
                const parseResult = await hintParser.parseTokenToEthHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0
            });
    
            it('should parse the t2e hint for mask out', async() => {
                t2eHintType = MASK_OUT_HINTTYPE;
                t2eSplits = [new BN(10000)];
                hint = '0x0202ff0000aa000f00ee';
        
                const parseResult = await hintParser.parseTokenToEthHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0
            });
    
            it('should parse the t2e hint for splits', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
                hint = '0x0302ff00000bb8aa000f1b5800ee';
        
                const parseResult = await hintParser.parseTokenToEthHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0
            });
    
            it('should revert parsing the t2e hint for splits', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
                hint = '0x0302ff00001388aa000f177000ee';
    
                try {
                    await hintParser.parseTokenToEthHint(hint);
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("t2t", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff0000', '0xaa000f'];
                e2tReserves = ['0xaa0005', '0xaa0034'];
                failingIndex = new BN(0);
            });

            it('should parse the t2t hint for both mask in', async() => {
                t2eHintType = MASK_IN_HINTTYPE;
                t2eSplits = [new BN(10000)];
                e2tHintType = MASK_IN_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x0102ff0000aa000f000102aa0005aa0034ee';

                const parseResult = await hintParser.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0
            });
    
            it('should parse the t2t hint for mask in, mask out', async() => {
                t2eHintType = MASK_OUT_HINTTYPE;
                t2eSplits = [new BN(10000)];
                e2tHintType = MASK_IN_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x0202ff0000aa000f000102aa0005aa0034ee';
                
                const parseResult = await hintParser.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0
            });
    
            it('should parse the t2t hint for mask in, splits', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
                e2tHintType = MASK_IN_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x0302ff00000bb8aa000f1b58000102aa0005aa0034ee';
                
                const parseResult = await hintParser.parseTokenToTokenHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0
            });
    
            it('should revert parsing the t2t hint for mask in, splits', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
                e2tHintType = MASK_IN_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x0302ff00001388aa000f1770000102aa0005aa0034ee';
                
                try {
                    await hintParser.parseTokenToTokenHint(hint);
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
                hint = '0x0102ff0000aa000f000202aa0005aa0034ee';

                const parseResult = await hintParser.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0
            });
    
            it('should parse the t2t hint for both mask out', async() => {
                t2eHintType = MASK_OUT_HINTTYPE;
                t2eSplits = [new BN(10000)];
                e2tHintType = MASK_OUT_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x0202ff0000aa000f000202aa0005aa0034ee';

                const parseResult = await hintParser.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0        
            });
    
            it('should parse the t2t hint for mask out, splits', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
                e2tHintType = MASK_OUT_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x0302ff00000bb8aa000f1b58000202aa0005aa0034ee';

                const parseResult = await hintParser.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0        
            });
    
            it('should revert parsing the t2t hint for mask out, splits', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
                e2tHintType = MASK_OUT_HINTTYPE;
                e2tSplits = [new BN(10000)];
                hint = '0x0302ff00001388aa000f1770000202aa0005aa0034ee';
                
                try {
                    await hintParser.parseTokenToTokenHint(hint);
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
                hint = '0x0102ff0000aa000f000302aa00050bb8aa00341b58ee';

                const parseResult = await hintParser.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0
            });
    
            it('should parse the t2t hint for splits, mask out', async() => {
                e2tHintType = SPLIT_HINTTYPE;
                e2tSplits = [new BN(3000), new BN(7000)];
                t2eHintType = MASK_OUT_HINTTYPE;
                t2eSplits = [new BN(10000)];
                hint = '0x0202ff0000aa000f000302aa00050bb8aa00341b58ee';

                const parseResult = await hintParser.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0        
            });
    
            it('should parse the t2t hint for both splits', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
                e2tHintType = SPLIT_HINTTYPE;
                e2tSplits = [new BN(5000), new BN(5000)];
                hint = '0x0302ff00000bb8aa000f1b58000302aa00051388aa00341388ee';

                const parseResult = await hintParser.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failingIndex, failingIndex); // TODO: not implemented, keep at 0
            });
    
            it('should revert parsing the t2t hint for both splits', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
                e2tHintType = SPLIT_HINTTYPE;
                e2tSplits = [new BN(5000), new BN(5000)];
                hint = '0x0302ff00001388aa000f1770000302aa00051388aa00341388ee';

                try {
                    await hintParser.parseTokenToTokenHint(hint);
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }  
            });
        });
    });

    describe("test decoding reserves from various hints", function() {
        // TODO: need mock network
        it('should decode the reserves from e2t hint for mask in', async() => {
        });
    });

    it('should get bytes', async() => {
        const start = 5;
        const length = 2;
        hint = '0x0302ff00001388aa000f1770000302aa00051388aa00341388ee';

        const bytesResult = await hintParser.getBytes(hint, start, length);
        const expectedResult = `0x${hint.slice(2).substr(start * 2, length * 2)}`;
        Helper.assertEqual(bytesResult, expectedResult);
    });

    it('should single byte', async() => {
        const index = 8;
        hint = '0x0302ff00001388aa000f1770000302aa00051388aa00341388ee';

        const bytesResult = await hintParser.getSingleByte(hint, index);
        const expectedResult = `0x${hint.slice(2).substr(index * 2, 2)}`;
        Helper.assertEqual(bytesResult, expectedResult);
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
