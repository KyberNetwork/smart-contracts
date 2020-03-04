const MockHintHandler = artifacts.require('MockHintHandler.sol');
const Helper = require("../helper.js");
const BN = web3.utils.BN;

const SEPARATOR_OPCODE = '0x77';
const MASK_IN_OPCODE = '0x01';
const MASK_OUT_OPCODE = '0x02';
const SPLIT_TRADE_OPCODE = '0x03';
const END_OPCODE = '0xee';
const MASK_IN_HINTTYPE = 0;
const MASK_OUT_HINTTYPE = 1;
const SPLIT_HINTTYPE = 2;
const TRADE_TYPES = {
    MASK_IN: MASK_IN_HINTTYPE,
    MASK_OUT: MASK_OUT_HINTTYPE,
    SPLITS: SPLIT_HINTTYPE,
}

let hintHandler;
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
let failedIndex;

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
            '0xff12345663820d8f',
            '0xff1234567a334f7d',
            '0xaa12345616709a5d',
            '0xaa00000031E04C7F',
            '0xcc12345675fff057',
        ]

        for (var i = 0; i < reserves.length; i++) {
            await hintHandler.addReserve(reserves[i], ids[i]);
        }
    });

    describe("test building various hints", function() {
        describe("e2t", function() {
            before('one time init of vars', async() => {
                e2tReserves = ['0xff12345663820d8f', '0xaa12345616709a5d'];
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should build the e2t hint for ${tradeType}`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == SPLIT_HINTTYPE) {
                        e2tSplits = [];
                    } else {
                        e2tSplits = [new BN(3000), new BN(7000)];
                    }
                    
                    const hintResult = await hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                    const expectedResult = builde2tHint(e2tOpcode, e2tReserves, e2tSplits);                
            
                    Helper.assertEqual(hintResult, expectedResult);
                });
            });
    
            it('should revert the e2t hint for SPLITS due to >10000bps', async() => {
                e2tOpcode = SPLIT_HINTTYPE;
                e2tSplits = [new BN(5000), new BN(6000)]; // more than 100bps
        
                try {
                    await hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });

            it('should revert the e2t hint for SPLITS due to <10000bps', async() => {
                e2tOpcode = SPLIT_HINTTYPE;
                e2tSplits = [new BN(3000), new BN(4000)]; // less than 100bps
        
                try {
                    await hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });

            it('should revert the e2t hint due to INVALID trade type', async() => {
                e2tOpcode = '0x09'; // trade type does not exist
                e2tSplits = [];
        
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
                t2eReserves = ['0xff1234567a334f7d', '0xcc12345675fff057'];
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should build the t2e hint for ${tradeType}`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == SPLIT_HINTTYPE) {
                        t2eSplits = [];
                    } else {
                        t2eSplits = [new BN(3000), new BN(7000)];
                    }
                    
                    const hintResult = await hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);
                    const expectedResult = buildt2eHint(t2eOpcode, t2eReserves, t2eSplits);                
            
                    Helper.assertEqual(hintResult, expectedResult);
                });
            });
    
            it('should revert the t2e hint for SPLITS due to >10000bps', async() => {
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(5000), new BN(6000)]; // more than 100bps
        
                try {
                    await hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });

            it('should revert the t2e hint for SPLITS due to <10000bps', async() => {
                t2eOpcode = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(4000)]; // less than 100bps
        
                try {
                    await hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });

            it('should revert the t2e hint due to INVALID trade type', async() => {
                t2eOpcode = '0x09'; // trade type does not exist
                t2eSplits = [];
        
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
                e2tReserves = ['0xff12345663820d8f', '0xaa12345616709a5d'];
                t2eReserves = ['0xff1234567a334f7d', '0xcc12345675fff057'];
            });

            Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                    it(`should build the t2t hint for e2t ${e2tTradeType} t2e ${t2eTradeType}`, async() => {
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = [];
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = [];
    
                        if (e2tTradeType == SPLIT_HINTTYPE) {
                            e2tSplits = [];
                        } else {
                            e2tSplits = [new BN(5000), new BN(5000)];
                        }

                        if (t2eTradeType == SPLIT_HINTTYPE) {
                            t2eSplits = [];
                        } else {
                            t2eSplits = [new BN(3000), new BN(7000)];
                        }
                        
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
                });
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert the t2t hint for SPLITS, ${tradeType} due to >10000bps`, async() => {
                    e2tOpcode = SPLIT_HINTTYPE;
                    e2tSplits = [new BN(5000), new BN(6000)]; // more than 100bps
                    t2eOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == SPLIT_HINTTYPE) {
                        t2eSplits = [];
                    } else {
                        t2eSplits = [new BN(3000), new BN(7000)];
                    }
            
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
    
                it(`should revert the t2t hint for SPLITS, ${tradeType} due to <10000bps`, async() => {
                    e2tOpcode = SPLIT_HINTTYPE;
                    e2tSplits = [new BN(3000), new BN(4000)]; // less than 100bps
                    t2eOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == SPLIT_HINTTYPE) {
                        t2eSplits = [];
                    } else {
                        t2eSplits = [new BN(3000), new BN(7000)];
                    }
            
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
    
                it(`should revert the t2t hint for SPLITS, ${tradeType} due to empty SPLITS`, async() => {
                    e2tOpcode = SPLIT_HINTTYPE;
                    e2tSplits = []; // empty
                    t2eOpcode = TRADE_TYPES[tradeType];
                    
                    if (tradeType == SPLIT_HINTTYPE) {
                        t2eSplits = [];
                    } else {
                        t2eSplits = [new BN(3000), new BN(7000)];
                    }
            
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
    
                it(`should revert the t2t hint for ${tradeType} due to INVALID e2t trade type`, async() => {
                    e2tOpcode = '0x09'; // trade type does not exist
                    e2tSplits = [];
                    t2eOpcode = TRADE_TYPES[tradeType];
                    
                    if (tradeType == SPLIT_HINTTYPE) {
                        t2eSplits = [];
                    } else {
                        t2eSplits = [new BN(3000), new BN(7000)];
                    }
            
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
    });

    describe("test parsing various hints", function() {
        describe("e2t", function() {
            before('one time init of vars', async() => {
                e2tReserves = ['0xff12345663820d8f', '0xaa12345616709a5d'];
            });

            it('should parse the e2t hint for MASK_IN', async() => {
                e2tHintType = MASK_IN_HINTTYPE;
                e2tSplits = [new BN(10000)];
                failedIndex = 0;
                hint = '0x770102ff12345663820d8faa12345616709a5dee';
        
                const parseResult = await hintHandler.parseEthToTokenHint(hint);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
    
            it('should parse the e2t hint for MASK_OUT', async() => {
                e2tHintType = MASK_OUT_HINTTYPE;
                e2tSplits = [new BN(10000)];
                failedIndex = 0;
                hint = '0x770202ff12345663820d8faa12345616709a5dee';
        
                const parseResult = await hintHandler.parseEthToTokenHint(hint);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
    
            it('should parse the e2t hint for SPLITS', async() => {
                e2tHintType = SPLIT_HINTTYPE;
                e2tSplits = [new BN(3000), new BN(7000)];
                failedIndex = 0;
                hint = '0x770302ff12345663820d8f0bb8aa12345616709a5d1b58ee';
        
                const parseResult = await hintHandler.parseEthToTokenHint(hint);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
        });

        describe("t2e", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff1234567a334f7d', '0xcc12345675fff057'];
            });

            it('should parse the t2e hint for MASK_IN', async() => {
                t2eHintType = MASK_IN_HINTTYPE;
                t2eSplits = [new BN(10000)];
                failedIndex = 0;
                hint = '0x0102ff1234567a334f7dcc12345675fff05777ee';
        
                const parseResult = await hintHandler.parseTokenToEthHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
    
            it('should parse the t2e hint for MASK_OUT', async() => {
                t2eHintType = MASK_OUT_HINTTYPE;
                t2eSplits = [new BN(10000)];
                failedIndex = 0;
                hint = '0x0202ff1234567a334f7dcc12345675fff05777ee';
        
                const parseResult = await hintHandler.parseTokenToEthHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
    
            it('should parse the t2e hint for SPLITS', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
                failedIndex = 0;
                hint = '0x0302ff1234567a334f7d0bb8cc12345675fff0571b5877ee';
        
                const parseResult = await hintHandler.parseTokenToEthHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
        });

        describe("t2t", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff1234567a334f7d', '0xcc12345675fff057'];
                e2tReserves = ['0xff12345663820d8f', '0xaa12345616709a5d'];
            });

            it('should parse the t2t hint for both MASK_IN', async() => {
                t2eHintType = MASK_IN_HINTTYPE;
                t2eSplits = [new BN(10000)];
                e2tHintType = MASK_IN_HINTTYPE;
                e2tSplits = [new BN(10000)];
                failedIndex = 0;
                hint = '0x0102ff1234567a334f7dcc12345675fff057770102ff12345663820d8faa12345616709a5dee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
    
            it('should parse the t2t hint for MASK_IN, MASK_OUT', async() => {
                t2eHintType = MASK_OUT_HINTTYPE;
                t2eSplits = [new BN(10000)];
                e2tHintType = MASK_IN_HINTTYPE;
                e2tSplits = [new BN(10000)];
                failedIndex = 0;
                hint = '0x0202ff1234567a334f7dcc12345675fff057770102ff12345663820d8faa12345616709a5dee';
                
                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
    
            it('should parse the t2t hint for MASK_IN, SPLITS', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
                e2tHintType = MASK_IN_HINTTYPE;
                e2tSplits = [new BN(10000)];
                failedIndex = 0;
                hint = '0x0302ff1234567a334f7d0bb8cc12345675fff0571b58770102ff12345663820d8faa12345616709a5dee';
                
                const parseResult = await hintHandler.parseTokenToTokenHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
    
            it('should parse the t2t hint for MASK_OUT, MASK_IN', async() => {
                t2eHintType = MASK_IN_HINTTYPE;
                t2eSplits = [new BN(10000)];
                e2tHintType = MASK_OUT_HINTTYPE;
                e2tSplits = [new BN(10000)];
                failedIndex = 0;
                hint = '0x0102ff1234567a334f7dcc12345675fff057770202ff12345663820d8faa12345616709a5dee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
    
            it('should parse the t2t hint for both MASK_OUT', async() => {
                t2eHintType = MASK_OUT_HINTTYPE;
                t2eSplits = [new BN(10000)];
                e2tHintType = MASK_OUT_HINTTYPE;
                e2tSplits = [new BN(10000)];
                failedIndex = 0;
                hint = '0x0202ff1234567a334f7dcc12345675fff057770202ff12345663820d8faa12345616709a5dee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
    
            it('should parse the t2t hint for MASK_OUT, SPLITS', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
                e2tHintType = MASK_OUT_HINTTYPE;
                e2tSplits = [new BN(10000)];
                failedIndex = 0;
                hint = '0x0302ff1234567a334f7d0bb8cc12345675fff0571b58770202ff12345663820d8faa12345616709a5dee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
    
            it('should parse the t2t hint for SPLITS, MASK_IN', async() => {
                t2eHintType = MASK_IN_HINTTYPE;
                t2eSplits = [new BN(10000)];        
                e2tHintType = SPLIT_HINTTYPE;
                e2tSplits = [new BN(3000), new BN(7000)];
                failedIndex = 0;
                hint = '0x0102ff1234567a334f7dcc12345675fff057770302ff12345663820d8f0bb8aa12345616709a5d1b58ee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
    
            it('should parse the t2t hint for SPLITS, MASK_OUT', async() => {
                e2tHintType = SPLIT_HINTTYPE;
                e2tSplits = [new BN(3000), new BN(7000)];
                t2eHintType = MASK_OUT_HINTTYPE;
                t2eSplits = [new BN(10000)];
                failedIndex = 0;
                hint = '0x0202ff1234567a334f7dcc12345675fff057770302ff12345663820d8f0bb8aa12345616709a5d1b58ee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
    
            it('should parse the t2t hint for both SPLITS', async() => {
                t2eHintType = SPLIT_HINTTYPE;
                t2eSplits = [new BN(3000), new BN(7000)];
                e2tHintType = SPLIT_HINTTYPE;
                e2tSplits = [new BN(5000), new BN(5000)];
                failedIndex = 0;
                hint = '0x0302ff1234567a334f7d0bb8cc12345675fff0571b58770302ff12345663820d8f1388aa12345616709a5d1388ee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
        });
    });

    describe("test parsing various incorrect hints", function() {
        describe("e2t", function() {
            before('one time init of vars', async() => {
                e2tHintType = 0;
                e2tReserves = [];
                e2tSplits = [];
                t2eHintType = 0;
                t2eReserves = [];
                t2eSplits = [];
            });
            
            it('should return failedIndex for e2t hint for SPLITS due to >10000bps', async() => {
                failedIndex = 23;
                hint = '0x770302ff12345663820d8f1388aa12345616709a5d1770ee';
    
                const parseResult = await hintHandler.parseEthToTokenHint(hint);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });

            it('should return failedIndex for e2t hint for SPLITS due to <10000bps', async() => {
                failedIndex = 23;
                hint = '0x770302ff12345663820d8f0bb8aa12345616709a5d0fa0ee';
    
                const parseResult = await hintHandler.parseEthToTokenHint(hint);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
        });

        describe("t2e", function() {
            it('should return failedIndex for t2e hint for SPLITS due to >10000bps', async() => {
                failedIndex = 22;
                hint = '0x0302ff1234567a334f7d1388cc12345675fff057177077ee';
    
                const parseResult = await hintHandler.parseTokenToEthHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });

            it('should return failedIndex for t2e hint for SPLITS due to <10000bps', async() => {
                failedIndex = 22;
                hint = '0x0302ff1234567a334f7d0bb8cc12345675fff0570fa077ee';
    
                const parseResult = await hintHandler.parseTokenToEthHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });
        });

        describe("t2t", function() {
            it('should return failedIndex for t2t hint for MASK_IN, SPLITS due to >10000bps', async() => {
                failedIndex = 22;
                hint = '0x0302ff1234567a334f7d1388cc12345675fff0571770770102ff12345663820d8faa12345616709a5dee';
                
                const parseResult = await hintHandler.parseTokenToTokenHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });

            it('should return failedIndex for t2t hint for MASK_OUT, SPLITS due to >10000bps', async() => {
                failedIndex = 22;
                hint = '0x0302ff1234567a334f7d1388cc12345675fff0571770770202ff12345663820d8faa12345616709a5dee';
                
                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex); 
            });

            it('should return failedIndex for t2t hint for both SPLITS due to >10000bps', async() => {
                failedIndex = 22;
                hint = '0x0302ff1234567a334f7d1338cc12345675fff0571770770302ff12345663820d8f1388aa12345616709a5d1388ee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });

            it('should return failedIndex for t2t hint for MASK_IN, SPLITS due to <10000bps', async() => {
                failedIndex = 22;
                hint = '0x0302ff1234567a334f7d0bb8cc12345675fff0570fa0770102ff12345663820d8faa12345616709a5dee';
                
                const parseResult = await hintHandler.parseTokenToTokenHint(hint);
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
            });

            it('should return failedIndex for t2t hint for MASK_OUT, SPLITS due to <10000bps', async() => {
                failedIndex = 22;
                hint = '0x0302ff1234567a334f7d0bb8cc12345675fff0570fa0770202ff12345663820d8faa12345616709a5dee';
                
                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex); 
            });

            it('should return failedIndex for t2t hint for both SPLITS due to <10000bps', async() => {
                failedIndex = 22;
                hint = '0x0302ff1234567a334f7d0bb8cc12345675fff0570fa0770302ff12345663820d8f1388aa12345616709a5d1388ee';

                const parseResult = await hintHandler.parseTokenToTokenHint(hint);                
                Helper.assertEqual(parseResult.tokenToEthType, t2eHintType);
                assert.deepEqual(parseResult.tokenToEthReserveIds, t2eReserves);
                Helper.assertEqual(parseResult.tokenToEthSplits, t2eSplits);
                Helper.assertEqual(parseResult.ethToTokenType, e2tHintType);
                assert.deepEqual(parseResult.ethToTokenReserveIds, e2tReserves);
                Helper.assertEqual(parseResult.ethToTokenSplits, e2tSplits);
                Helper.assertEqual(parseResult.failedIndex, failedIndex);
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
