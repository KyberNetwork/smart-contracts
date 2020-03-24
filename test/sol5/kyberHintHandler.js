const MockHintHandler = artifacts.require('MockHintHandler.sol');
const Helper = require("../helper.js");
const BN = web3.utils.BN;

const NO_HINT_TYPE = '';
const INVALID_HINT_TYPE = '0x09';
const MASK_IN = 0;
const MASK_OUT = 1;
const SPLIT = 2;
const BPS_SPLIT = ['3000', '7000'];
const TRADE_TYPES = {
    MASK_IN,
    MASK_OUT,
    SPLIT,
}
const INVALID_SPLIT_BPS = {
    MORE_THAN_10000BPS: ['5000', '6000'], // more than 10000bps
    LESS_THAN_10000BPS: ['3000', '4000'], // less than 10000bos
    EMPTY_SPLITS: [],
}
const ID_TO_ADDRESS = {
    '0xff12345663820d8f': '0x63825c174ab367968EC60f061753D3bbD36A0D8F',
    '0xff1234567a334f7d': '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D',
    '0xaa12345616709a5d': '0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D',
    '0xaa00000031E04C7F': '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F',
    '0xcc12345675fff057': '0x75fF6BeC6Ed398FA80EA1596cef422D64681F057',
};

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

contract('KyberHintHandler', function(accounts) {
    before('one time init, admin account', async() => {
        admin = accounts[0];
    });

    it('should init hint parser', async function () {
        hintHandler = await MockHintHandler.new();
    });

    it('should init reserveAddressToId and reserveIdToAddresses mappings', async function () {
        const idToAddress = Object.keys(ID_TO_ADDRESS);

        for (var i = 0; i < idToAddress.length; i++) {
            await hintHandler.addReserve(ID_TO_ADDRESS[idToAddress[i]], idToAddress[i]);
        }
    });

    describe("test building various hints", function() {
        describe("Token to ETH (T2E)", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff1234567a334f7d', '0xcc12345675fff057'];
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should build the T2E hint for ${tradeType}`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        t2eSplits = BPS_SPLIT;
                    } else {
                        t2eSplits = [];
                    }
                    
                    const hintResult = await hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);
                    const expectedResult = buildHint(t2eOpcode, t2eReserves, t2eSplits);
            
                    Helper.assertEqual(hintResult, expectedResult);
                });
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert the T2E hint for ${tradeType} due to empty reserveIds`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        t2eSplits = BPS_SPLIT;
                    } else {
                        t2eSplits = [];
                    }
                    
                    try {
                        await hintHandler.buildTokenToEthHint(t2eOpcode, [], t2eSplits);                        
                        assert(false, "throw was expected in line above.");
                    } catch(e){
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert the T2E hint for ${tradeType} due to invalid split values`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        t2eSplits = [];
                    } else {
                        t2eSplits = BPS_SPLIT;
                    }
                    
                    try {
                        await hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);                        
                        assert(false, "throw was expected in line above.");
                    } catch(e){
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });
            });

            Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                it(`should revert the T2E hint for SPLITS due to ${invalidSplit}`, async() => {
                    t2eOpcode = SPLIT;
                    t2eSplits = INVALID_SPLIT_BPS[invalidSplit];
            
                    try {
                        await hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);                        
                        assert(false, "throw was expected in line above.");
                    } catch(e){
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });
            });

            it('should revert the T2E hint for invalid hint type', async() => {
                t2eOpcode = INVALID_HINT_TYPE;
                t2eSplits = [];

                try {
                    await hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);                        
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("ETH to Token (E2T)", function() {
            before('one time init of vars', async() => {
                e2tReserves = ['0xff12345663820d8f', '0xaa12345616709a5d'];
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should build the E2T hint for ${tradeType}`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        e2tSplits = BPS_SPLIT;
                    } else {
                        e2tSplits = [];
                    }
                    
                    const hintResult = await hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                    const expectedResult = buildHint(e2tOpcode, e2tReserves, e2tSplits);                
            
                    Helper.assertEqual(hintResult, expectedResult);
                });
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert the E2T hint for ${tradeType} due to empty reserveIds`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        e2tSplits = BPS_SPLIT;
                    } else {
                        e2tSplits = [];
                    }
                    
                    try {
                        await hintHandler.buildEthToTokenHint(e2tOpcode, [], e2tSplits);                        
                        assert(false, "throw was expected in line above.");
                    } catch(e){
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert the E2T hint for ${tradeType} due to invalid split values`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        e2tSplits = [];
                    } else {
                        e2tSplits = BPS_SPLIT;
                    }
                    
                    try {
                        await hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                        assert(false, "throw was expected in line above.");
                    } catch(e){
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });
            });
            
            Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                it(`should revert the E2T hint for SPLITS due to ${invalidSplit}`, async() => {
                    e2tOpcode = SPLIT;
                    e2tSplits = INVALID_SPLIT_BPS[invalidSplit];
            
                    try {
                        await hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                        assert(false, "throw was expected in line above.");
                    } catch(e){
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });
            });

            it('should revert the E2T hint for invalid hint type', async() => {
                e2tOpcode = INVALID_HINT_TYPE;
                e2tSplits = [];

                try {
                    await hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);                        
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("Token to Token (T2T)", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff1234567a334f7d', '0xcc12345675fff057'];
                e2tReserves = ['0xff12345663820d8f', '0xaa12345616709a5d'];
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                    it(`should build the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType}`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = [];
    
                        if (t2eTradeType == 'SPLIT') {
                            t2eSplits = BPS_SPLIT;
                        } else {
                            t2eSplits = [];
                        }

                        if (e2tTradeType == 'SPLIT') {
                            e2tSplits = BPS_SPLIT;
                        } else {
                            e2tSplits = [];
                        }
                        
                        const hintResult = await hintHandler.buildTokenToTokenHint(
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );
                        const expectedResult = buildHintT2T(
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );
                
                        Helper.assertEqual(hintResult, expectedResult);
                    });

                    it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to invalid split values`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = [];
    
                        if (t2eTradeType == 'SPLIT') {
                            t2eSplits = [];
                        } else {
                            t2eSplits = BPS_SPLIT;
                        }

                        if (e2tTradeType == 'SPLIT') {
                            e2tSplits = [];
                        } else {
                            e2tSplits = BPS_SPLIT;
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

                    it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to empty reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = [];
    
                        if (t2eTradeType == 'SPLIT') {
                            t2eSplits = BPS_SPLIT;
                        } else {
                            t2eSplits = [];
                        }

                        if (e2tTradeType == 'SPLIT') {
                            e2tSplits = BPS_SPLIT;
                        } else {
                            e2tSplits = [];
                        }
                        
                        try {
                            await hintHandler.buildTokenToTokenHint(
                                t2eOpcode,
                                [],
                                t2eSplits,
                                e2tOpcode,
                                [],
                                e2tSplits,
                            );
                            assert(false, "throw was expected in line above.");
                        } catch(e){
                            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                        }
                    });
                });
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                    it(`should revert the T2T hint for SPLITS, ${tradeType} due to T2E ${invalidSplit}`, async() => {
                        t2eOpcode = SPLIT;
                        t2eSplits = INVALID_SPLIT_BPS[invalidSplit];
                        e2tOpcode = TRADE_TYPES[tradeType];

                        if (tradeType == 'SPLIT') {
                            e2tSplits = BPS_SPLIT;
                        } else {
                            e2tSplits = [];
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

                it(`should revert the T2T hint for T2E ${tradeType} due to INVALID E2T hint type`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    e2tOpcode = INVALID_HINT_TYPE; // trade type does not exist
                    e2tSplits = [];
                    
                    if (tradeType == 'SPLIT') {
                        t2eSplits = BPS_SPLIT;
                    } else {
                        t2eSplits = [];
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

                Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                    it(`should revert the T2T hint for ${tradeType}, SPLITS due to E2T ${invalidSplit}`, async() => {
                        t2eOpcode = TRADE_TYPES[tradeType];
                        e2tOpcode = SPLIT;
                        e2tSplits = INVALID_SPLIT_BPS[invalidSplit];

                        if (tradeType == 'SPLIT') {
                            t2eSplits = BPS_SPLIT;
                        } else {
                            t2eSplits = [];
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

                it(`should revert the T2T hint for E2T ${tradeType} due to INVALID T2E hint type`, async() => {
                    t2eOpcode = INVALID_HINT_TYPE; // trade type does not exist
                    t2eSplits = [];
                    e2tOpcode = TRADE_TYPES[tradeType];
                    
                    if (tradeType == 'SPLIT') {
                        e2tSplits = BPS_SPLIT;
                    } else {
                        e2tSplits = [];
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
        describe("Token to ETH (T2E)", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff12345663820d8f', '0xaa12345616709a5d'];
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should parse the T2E hint for ${tradeType}`, async() => {
                    t2eHintType = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        t2eSplits = BPS_SPLIT;
                    } else {
                        t2eSplits = [];
                    }

                    hint = buildHint(t2eHintType, t2eReserves, t2eSplits);
            
                    const parseResult = await hintHandler.parseTokenToEthHint(hint);
                    const expectedResult = parseHint(hint);
    
                    Helper.assertEqual(parseResult.tokenToEthType, expectedResult.tradeType);
                    assert.deepEqual(parseResult.tokenToEthReserveIds, expectedResult.reserveIds);
                    assert.deepEqual(parseResult.tokenToEthAddresses, expectedResult.addresses);
                    Helper.assertEqual(parseResult.tokenToEthSplits, expectedResult.splits);
                });
            });
        });

        describe("ETH to Token (E2T)", function() {
            before('one time init of vars', async() => {
                e2tReserves = ['0xff1234567a334f7d', '0xcc12345675fff057'];
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should parse the E2T hint for ${tradeType}`, async() => {
                    e2tHintType = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        e2tSplits = BPS_SPLIT;
                    } else {
                        e2tSplits = [];
                    }

                    hint = buildHint(e2tHintType, e2tReserves, e2tSplits);
            
                    const parseResult = await hintHandler.parseEthToTokenHint(hint);
                    const expectedResult = parseHint(hint);
    
                    Helper.assertEqual(parseResult.ethToTokenType, expectedResult.tradeType);
                    assert.deepEqual(parseResult.ethToTokenReserveIds, expectedResult.reserveIds);
                    assert.deepEqual(parseResult.ethToTokenAddresses, expectedResult.addresses);
                    Helper.assertEqual(parseResult.ethToTokenSplits, expectedResult.splits);
                });
            });
        });

        describe("Token to Token (T2T)", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff1234567a334f7d', '0xcc12345675fff057'];
                e2tReserves = ['0xff12345663820d8f', '0xaa12345616709a5d'];
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                    it(`should parse the T2T hint for ${t2eTradeType}, ${e2tTradeType}`, async() => {
                        t2eHintType = TRADE_TYPES[t2eTradeType];
                        t2eSplits = [];
                        e2tHintType = TRADE_TYPES[e2tTradeType];
                        e2tSplits = [];
    
                        if (t2eTradeType == 'SPLIT') {
                            t2eSplits = BPS_SPLIT;
                        } else {
                            t2eSplits = [];
                        }

                        if (e2tTradeType == 'SPLIT') {
                            e2tSplits = BPS_SPLIT;
                        } else {
                            e2tSplits = [];
                        }

                        hint = buildHintT2T(
                            t2eHintType,
                            t2eReserves,
                            t2eSplits,
                            e2tHintType,
                            e2tReserves,
                            e2tSplits,
                        );
                
                        const parseResult = await hintHandler.parseTokenToTokenHint(hint);
                        const expectedResult = parseHintT2T(hint);
        
                        Helper.assertEqual(parseResult.tokenToEthType, expectedResult.t2eType);
                        assert.deepEqual(parseResult.tokenToEthReserveIds, expectedResult.t2eReserveIds);
                        assert.deepEqual(parseResult.tokenToEthAddresses, expectedResult.t2eAddresses);
                        Helper.assertEqual(parseResult.tokenToEthSplits, expectedResult.t2eSplits);
                        Helper.assertEqual(parseResult.ethToTokenType, expectedResult.e2tType);
                        assert.deepEqual(parseResult.ethToTokenReserveIds, expectedResult.e2tReserveIds);
                        assert.deepEqual(parseResult.ethToTokenAddresses, expectedResult.e2tAddresses);
                        Helper.assertEqual(parseResult.ethToTokenSplits, expectedResult.e2tSplits);
                    });
                });
            });
        });
    });

    describe("test parsing various incorrect hints", function() {
        describe("Token to ETH (T2E)", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff12345663820d8f', '0xaa12345616709a5d'];
            });
            
            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should return no data for T2E hint for ${tradeType} due to invalid split value`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        t2eSplits = [];
                    } else {
                        t2eSplits = BPS_SPLIT;
                    }
                    
                    const hint = buildHint(t2eOpcode, t2eReserves, t2eSplits);            
                    const parseResult = await hintHandler.parseTokenToEthHint(hint);
                    const expectedResult = parseHint(hint);
    
                    Helper.assertEqual(parseResult.tokenToEthType, expectedResult.tradeType);
                    assert.deepEqual(parseResult.tokenToEthReserveIds, []);
                    assert.deepEqual(parseResult.tokenToEthAddresses, []);
                    Helper.assertEqual(parseResult.tokenToEthSplits, []);
                });

                it(`should return no data for T2E hint for ${tradeType} due to empty reserveIds`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        t2eSplits = BPS_SPLIT;
                    } else {
                        t2eSplits = [];
                    }
                    
                    const hint = buildHint(t2eOpcode, [], t2eSplits);            
                    const parseResult = await hintHandler.parseTokenToEthHint(hint);
                    const expectedResult = parseHint(hint);
    
                    Helper.assertEqual(parseResult.tokenToEthType, expectedResult.tradeType);
                    assert.deepEqual(parseResult.tokenToEthReserveIds, []);
                    assert.deepEqual(parseResult.tokenToEthAddresses, []);
                    Helper.assertEqual(parseResult.tokenToEthSplits, []);
                });
            });

            Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                it(`should return no data for T2E hint for SPLITS due to ${invalidSplit}`, async() => {
                    t2eOpcode = SPLIT;
                    t2eSplits = INVALID_SPLIT_BPS[invalidSplit];
            
                    const hint = buildHint(t2eOpcode, t2eReserves, t2eSplits);            
                    const parseResult = await hintHandler.parseTokenToEthHint(hint);
                    const expectedResult = parseHint(hint);
    
                    Helper.assertEqual(parseResult.tokenToEthType, expectedResult.tradeType);
                    assert.deepEqual(parseResult.tokenToEthReserveIds, []);
                    assert.deepEqual(parseResult.tokenToEthAddresses, []);
                    Helper.assertEqual(parseResult.tokenToEthSplits, []);
                });
            });

            it('should revert the T2E hint for invalid hint type', async() => {
                t2eOpcode = INVALID_HINT_TYPE;
                t2eSplits = [];

                const hint = buildHint(t2eOpcode, t2eReserves, t2eSplits);
                
                try {
                    await hintHandler.parseTokenToEthHint(hint);
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("ETH to Token (E2T)", function() {
            before('one time init of vars', async() => {
                e2tReserves = ['0xff1234567a334f7d', '0xcc12345675fff057'];
            });
            
            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should return no data for E2T hint for ${tradeType} due to invalid split value`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        e2tSplits = [];
                    } else {
                        e2tSplits = BPS_SPLIT;
                    }
                    
                    const hint = buildHint(e2tOpcode, e2tReserves, e2tSplits);
                    const parseResult = await hintHandler.parseEthToTokenHint(hint);
                    const expectedResult = parseHint(hint);
    
                    Helper.assertEqual(parseResult.ethToTokenType, expectedResult.tradeType);
                    assert.deepEqual(parseResult.ethToTokenReserveIds, []);
                    assert.deepEqual(parseResult.ethToTokenAddresses, []);
                    Helper.assertEqual(parseResult.ethToTokenSplits, []);
                });

                it(`should return no data for E2T hint for ${tradeType} due to empty reserveIds`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        e2tSplits = BPS_SPLIT;
                    } else {
                        e2tSplits = [];
                    }
                    
                    const hint = buildHint(e2tOpcode, [], e2tSplits);
                    const parseResult = await hintHandler.parseEthToTokenHint(hint);
                    const expectedResult = parseHint(hint);
    
                    Helper.assertEqual(parseResult.ethToTokenType, expectedResult.tradeType);
                    assert.deepEqual(parseResult.ethToTokenReserveIds, []);
                    assert.deepEqual(parseResult.ethToTokenAddresses, []);
                    Helper.assertEqual(parseResult.ethToTokenSplits, []);
                });
            });

            Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                it(`should return no data for E2T hint for SPLITS due to ${invalidSplit}`, async() => {
                    e2tOpcode = SPLIT;
                    e2tSplits = INVALID_SPLIT_BPS[invalidSplit];
            
                    const hint = buildHint(e2tOpcode, e2tReserves, e2tSplits);
                    const parseResult = await hintHandler.parseEthToTokenHint(hint);
                    const expectedResult = parseHint(hint);
    
                    Helper.assertEqual(parseResult.ethToTokenType, expectedResult.tradeType);
                    assert.deepEqual(parseResult.ethToTokenReserveIds, []);
                    assert.deepEqual(parseResult.ethToTokenAddresses, []);
                    Helper.assertEqual(parseResult.ethToTokenSplits, []);
                });
            });

            it('should revert the E2T hint for invalid hint type', async() => {
                e2tOpcode = INVALID_HINT_TYPE;
                e2tSplits = [];

                const hint = buildHint(e2tOpcode, e2tReserves, e2tSplits);
                
                try {
                    await hintHandler.parseEthToTokenHint(hint);
                    assert(false, "throw was expected in line above.");
                } catch(e){
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("Token to Token (T2T)", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff1234567a334f7d', '0xcc12345675fff057'];
                e2tReserves = ['0xff12345663820d8f', '0xaa12345616709a5d'];
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                    it(`should return no data for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to invalid split values`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = [];
    
                        if (t2eTradeType == 'SPLIT') {
                            t2eSplits = [];
                        } else {
                            t2eSplits = BPS_SPLIT;
                        }

                        if (e2tTradeType == 'SPLIT') {
                            e2tSplits = [];
                        } else {
                            e2tSplits = BPS_SPLIT;
                        }
                        
                        const hint = buildHintT2T(
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );
                        const parseResult = await hintHandler.parseTokenToTokenHint(hint);
                        const expectedResult = parseHintT2T(hint);
        
                        Helper.assertEqual(parseResult.tokenToEthType, expectedResult.t2eType);
                        assert.deepEqual(parseResult.tokenToEthReserveIds, []);
                        assert.deepEqual(parseResult.tokenToEthAddresses, []);
                        Helper.assertEqual(parseResult.tokenToEthSplits, []);
                        Helper.assertEqual(parseResult.ethToTokenType, expectedResult.e2tType);
                        assert.deepEqual(parseResult.ethToTokenReserveIds, []);
                        assert.deepEqual(parseResult.ethToTokenAddresses, []);
                        Helper.assertEqual(parseResult.ethToTokenSplits, []);
                    });

                    it(`should return no data for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to empty reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = [];
    
                        if (t2eTradeType == 'SPLIT') {
                            t2eSplits = BPS_SPLIT;
                        } else {
                            t2eSplits = [];
                        }

                        if (e2tTradeType == 'SPLIT') {
                            e2tSplits = BPS_SPLIT;
                        } else {
                            e2tSplits = [];
                        }
                        
                        const hint = buildHintT2T(
                            t2eOpcode,
                            [],
                            t2eSplits,
                            e2tOpcode,
                            [],
                            e2tSplits,
                        );
                        const parseResult = await hintHandler.parseTokenToTokenHint(hint);
                        const expectedResult = parseHintT2T(hint);
        
                        Helper.assertEqual(parseResult.tokenToEthType, expectedResult.t2eType);
                        assert.deepEqual(parseResult.tokenToEthReserveIds, []);
                        assert.deepEqual(parseResult.tokenToEthAddresses, []);
                        Helper.assertEqual(parseResult.tokenToEthSplits, []);
                        Helper.assertEqual(parseResult.ethToTokenType, expectedResult.e2tType);
                        assert.deepEqual(parseResult.ethToTokenReserveIds, []);
                        assert.deepEqual(parseResult.ethToTokenAddresses, []);
                        Helper.assertEqual(parseResult.ethToTokenSplits, []);
                    });
                });
            });

            Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                    it(`should return no data for T2T hint for SPLIT, ${e2tTradeType} due to T2E Split ${invalidSplit}`, async() => {
                        t2eOpcode = SPLIT;
                        t2eSplits = INVALID_SPLIT_BPS[invalidSplit];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = BPS_SPLIT;
                
                        const hint = buildHintT2T(
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );
                        const parseResult = await hintHandler.parseTokenToTokenHint(hint);
                        const expectedResult = parseHintT2T(hint);
        
                        Helper.assertEqual(parseResult.tokenToEthType, expectedResult.t2eType);
                        assert.deepEqual(parseResult.tokenToEthReserveIds, []);
                        assert.deepEqual(parseResult.tokenToEthAddresses, []);
                        Helper.assertEqual(parseResult.tokenToEthSplits, []);
                        Helper.assertEqual(parseResult.ethToTokenType, expectedResult.e2tType);
                        assert.deepEqual(parseResult.ethToTokenReserveIds, []);
                        assert.deepEqual(parseResult.ethToTokenAddresses, []);
                        Helper.assertEqual(parseResult.ethToTokenSplits, []);
                    });
                });
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                    it(`should return no data for T2T hint for ${t2eTradeType}, SPLIT due to E2T Split ${invalidSplit}`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = BPS_SPLIT
                        e2tOpcode = SPLIT;
                        e2tSplits = INVALID_SPLIT_BPS[invalidSplit];
                
                        const hint = buildHintT2T(
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );
                        const parseResult = await hintHandler.parseTokenToTokenHint(hint);
                        const expectedResult = parseHintT2T(hint);
        
                        Helper.assertEqual(parseResult.tokenToEthType, expectedResult.t2eType);
                        assert.deepEqual(parseResult.tokenToEthReserveIds, []);
                        assert.deepEqual(parseResult.tokenToEthAddresses, []);
                        Helper.assertEqual(parseResult.tokenToEthSplits, []);
                        Helper.assertEqual(parseResult.ethToTokenType, expectedResult.e2tType);
                        assert.deepEqual(parseResult.ethToTokenReserveIds, []);
                        assert.deepEqual(parseResult.ethToTokenAddresses, []);
                        Helper.assertEqual(parseResult.ethToTokenSplits, []);
                    });
                });
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                it(`should return no data for T2T hint for ${t2eTradeType}, INVALID TYPE`, async() => {
                    t2eOpcode = TRADE_TYPES[t2eTradeType];
                    t2eSplits = [];
                    e2tOpcode = INVALID_HINT_TYPE;
                    e2tSplits = [];

                    if (t2eTradeType == 'SPLIT') {
                        t2eSplits = BPS_SPLIT;
                    } else {
                        t2eSplits = [];
                    }
            
                    const hint = buildHintT2T(
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );

                    try {
                        await hintHandler.parseTokenToTokenHint(hint);
                        assert(false, "throw was expected in line above.");
                    } catch(e){
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });
            });

            Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                it(`should return no data for T2T hint for INVALID TYPE, ${e2tTradeType}`, async() => {
                    t2eOpcode = INVALID_HINT_TYPE;
                    t2eSplits = [];
                    e2tOpcode = TRADE_TYPES[e2tTradeType];
                    e2tSplits = [];

                    if (e2tTradeType == 'SPLIT') {
                        e2tSplits = BPS_SPLIT;
                    } else {
                        e2tSplits = [];
                    }
            
                    const hint = buildHintT2T(
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );
                    
                    try {
                        await hintHandler.parseTokenToTokenHint(hint);
                        assert(false, "throw was expected in line above.");
                    } catch(e){
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });
            });
        });
    });
});

function buildHint(tradeType, reserveIds, splits) {
    return web3.eth.abi.encodeParameters(
        ['uint8', 'bytes8[]', 'uint[]'],
        [tradeType, reserveIds, splits],
    );
}

function buildHintT2T(t2eType, t2eReserveIds, t2eSplits, e2tType, e2tReserveIds, e2tSplits) {
    return web3.eth.abi.encodeParameters(
        ['uint8', 'bytes8[]', 'uint[]', 'uint8', 'bytes8[]', 'uint[]'],
        [t2eType, t2eReserveIds, t2eSplits, e2tType, e2tReserveIds, e2tSplits],
    );
}

function parseHint(hint) {
    let addresses = [];
    const params = web3.eth.abi.decodeParameters(
        ['uint8', 'bytes8[]', 'uint[]'],
        hint,
    );

    for (let i = 0; i < params['1'].length; i++) {
        addresses.push(ID_TO_ADDRESS[params['1'][i]]);
    }

    return { 
        tradeType: params['0'],
        reserveIds: params['1'],
        addresses,
        splits: params['2'],
    };
}

function parseHintT2T(hint) {
    let t2eAddresses = [];
    let e2tAddresses = [];
    const params = web3.eth.abi.decodeParameters(
        ['uint8', 'bytes8[]', 'uint[]', 'uint8', 'bytes8[]', 'uint[]'],
        hint,
    );

    for (let i = 0; i < params['1'].length; i++) {
        t2eAddresses.push(ID_TO_ADDRESS[params['1'][i]]);
    }
    for (let i = 0; i < params['4'].length; i++) {
        e2tAddresses.push(ID_TO_ADDRESS[params['4'][i]]);
    }

    return { 
        t2eType: params['0'],
        t2eReserveIds: params['1'],
        t2eAddresses,
        t2eSplits: params['2'],
        e2tType: params['3'],
        e2tReserveIds: params['4'],
        e2tAddresses,
        e2tSplits: params['5'],
    };
}
