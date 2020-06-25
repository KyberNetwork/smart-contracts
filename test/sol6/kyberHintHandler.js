const MockHintHandler = artifacts.require('MockHintHandler.sol');
const Helper = require("../helper.js");
const { expectRevert } = require('@openzeppelin/test-helpers');

const INVALID_HINT_TYPE = '0x09';
const BEST_OF_ALL = 0;
const MASK_IN = 1;
const MASK_OUT = 2;
const SPLIT = 3;
const BPS_SPLIT = ['2000', '1500', '1000', '5000', '500'];

const T2E_ORDERED = ['0xaa12345616709a5d', '0xaa12aa56bbfff000', '0xcc12345675fff057', '0xff12345663820d8f', '0xff1234567a334f7d'];
const T2E_UNORDERED = ['0xff1234567a334f7d', '0xaa12aa56bbfff000', '0xcc12345675fff057', '0xaa12345616709a5d', '0xff12345663820d8f'];
const T2E_DUPLICATES = ['0xaa12345616709a5d', '0xaa12aa56bbfff000', '0xcc12345675fff057', '0xcc12345675fff057', '0xff1234567a334f7d'];
const T2E_MISSING = ['0xff1234567a334f7d', '0xaa12aa56bbfff000', '0xcc12345675fff057', '0xaa12345616709a5d', '0xbb12aa56bbfff000' ]; // 0xbb12aa56bbfff000 doesn't exist
const E2T_ORDERED = ['0xaa00000031e04c7f', '0xaa12aa56bbfff000', '0xcc12345675fff057', '0xff12345663820d8f', '0xff1234567a334f7d'];
const E2T_UNORDERED = ['0xff1234567a334f7d', '0xaa00000031e04c7f', '0xff12345663820d8f', '0xaa12aa56bbfff000', '0xcc12345675fff057'];
const E2T_DUPLICATES = ['0xaa00000031e04c7f', '0xaa12aa56bbfff000', '0xcc12345675fff057', '0xff12345663820d8f', '0xaa00000031e04c7f'];
const E2T_MISSING = ['0xff12345663820d8f', '0xaa00000031e04c7f', '0xbb12345616709a5d', '0xaa12aa56bbfff000', '0xcc12345675fff057']; // 0xbb12345616709a5d doesn't exist

const TOKENS = [
    '0xdd974d5c2e2928dea5f71b9825b8b646686bd200',
    '0xdac17f958d2ee523a2206206994597c13d831ec7',
];
const UNLISTED_TOKENS = [
    '0x514910771af9ca656af840dff83e8264ecf986ca',
    '0x0d8775f648430679a709e98d2b0cb6250d2887ef',
];

const RESERVES_PER_TOKEN = {
    '0xdd974d5c2e2928dea5f71b9825b8b646686bd200': T2E_UNORDERED,
    '0xdac17f958d2ee523a2206206994597c13d831ec7': E2T_UNORDERED,
}

const TRADE_TYPES = {
    MASK_IN,
    MASK_OUT,
    SPLIT,
}
const INVALID_SPLIT_BPS = {
    MORE_THAN_10000BPS: {value: ['2000', '3000', '5000', '6000', '100'], revertMsg: 'total BPS != 10000'}, // more than 10000bps
    LESS_THAN_10000BPS: {value: ['1000', '500', '3000', '4000', '100'], revertMsg: 'total BPS != 10000'}, // less than 10000bos
    EMPTY_SPLITS: {value: [], revertMsg: 'reserveIds.length != splits.length'}
}
const ID_TO_ADDRESS = {
    '0xff12345663820d8f000000000000000000000000000000000000000000000000': '0x63825c174ab367968EC60f061753D3bbD36A0D8F',
    '0xff1234567a334f7d000000000000000000000000000000000000000000000000': '0x7a3370075a54B187d7bD5DceBf0ff2B5552d4F7D',
    '0xaa12345616709a5d000000000000000000000000000000000000000000000000': '0x1670DFb52806DE7789D5cF7D5c005cf7083f9A5D',
    '0xaa12aa56bbfff000000000000000000000000000000000000000000000000000': '0xb06Cf173DA7E297aa6268139c7Cb67C53D8E4f90',
    '0xaa7777cc1234500f000000000000000000000000000000000000000000000000': '0x45eb33D008801d547990cAF3b63B4F8aE596EA57',
    '0xaa00000031e04c7f000000000000000000000000000000000000000000000000': '0x31E085Afd48a1d6e51Cc193153d625e8f0514C7F',
    '0xcc12345675fff057000000000000000000000000000000000000000000000000': '0x75fF6BeC6Ed398FA80EA1596cef422D64681F057',
};

let hintHandler;
let admin;
let e2tOpcode;
let e2tReserves;
let e2tDupReserves;
let e2tMissingReserves;
let e2tSplits;
let e2tHintType
let t2eOpcode;
let t2eReserves;
let t2eDupReserves;
let t2eMissingReserves;
let t2eSplits;
let t2eHintType;
let actual;
let expected;
let expectedT2E;
let expectedE2T;
let token;
let hint;
let hints;
let revertMsg;

contract('KyberHintHandler', function(accounts) {
    before('one time init, admin account, and setup hint parser', async() => {
        admin = accounts[0];
        hintHandler = await MockHintHandler.new();

        const idToAddress = Object.keys(ID_TO_ADDRESS);

        for (let i = 0; i < idToAddress.length; i++) {
            await hintHandler.addReserve(ID_TO_ADDRESS[idToAddress[i]], idToAddress[i]);
        }

        for (const t in RESERVES_PER_TOKEN) {
            for (let i = 0; i < RESERVES_PER_TOKEN[t].length; i++) {
                await hintHandler.listPairForReserve(RESERVES_PER_TOKEN[t][i], t);
            }
        }

        // list token for unregistered reserveIDs
        await hintHandler.listPairForReserve('0xbb12aa56bbfff000', TOKENS[0]);
        await hintHandler.listPairForReserve('0xbb12345616709a5d', TOKENS[1]);
    });

    describe("test building various hints", function() {
        describe("Token to ETH (T2E)", function() {
            before('one time init of vars', async() => {
                t2eToken = TOKENS[0];
                t2eUnlistedToken = UNLISTED_TOKENS[0];
                t2eReserves = T2E_UNORDERED;
                t2eDupReserves = T2E_DUPLICATES;
                t2eMissingReserves = T2E_MISSING;
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should build the T2E hint for ${tradeType}`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = await hintHandler.buildTokenToEthHint(
                        t2eToken,
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                    );
                    expected = Helper.buildHint(tradeType)(t2eOpcode, t2eReserves, t2eSplits);
            
                    Helper.assertEqual(hint, expected);
                });

                if (tradeType === 'MASK_OUT') {
                    it('should build the T2E hint for MASK_OUT even if reserveIds is empty', async() => {
                        t2eOpcode = TRADE_TYPES['MASK_OUT'];
                        t2eSplits = [];
                        
                        hint = await hintHandler.buildTokenToEthHint(
                            t2eToken,
                            t2eOpcode,
                            [],
                            t2eSplits,
                        );
                        expected = Helper.buildHint(tradeType)(t2eOpcode, [], t2eSplits);
                
                        Helper.assertEqual(hint, expected);
                    });
                }
            });

            it('should build the T2E BEST-OF-ALL HINT', async() => {
                t2eOpcode = BEST_OF_ALL;
                
                hint = await hintHandler.buildTokenToEthHint(
                    t2eToken,
                    t2eOpcode,
                    [],
                    [],
                );
                expected = Helper.buildHint('BEST_OF_ALL')(t2eOpcode, [], []);
        
                Helper.assertEqual(hint, expected);
            });

            it('should revert the T2E BEST-OF-ALL HINT if reserveIds is NOT EMPTY', async() => {
                t2eOpcode = BEST_OF_ALL;
                
                await expectRevert(
                    hintHandler.buildTokenToEthHint(
                        t2eToken,
                        t2eOpcode,
                        t2eReserves,
                        [],
                    ),
                    'reserveIds and splits must be empty'
                );
            });

            it('should revert the T2E BEST-OF-ALL HINT if splits is NOT EMPTY', async() => {
                t2eOpcode = BEST_OF_ALL;
                
                await expectRevert(
                    hintHandler.buildTokenToEthHint(
                        t2eToken,
                        t2eOpcode,
                        [],
                        t2eSplits,
                    ),
                    'reserveIds and splits must be empty'
                );
            });

            it('should revert the T2E BEST-OF-ALL HINT if reserveIds and splits are NOT EMPTY', async() => {
                t2eOpcode = BEST_OF_ALL;
                
                await expectRevert(
                    hintHandler.buildTokenToEthHint(
                        t2eToken,
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                    ),
                    'reserveIds and splits must be empty'
                );
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                if (tradeType !== 'MASK_OUT') {
                    it(`should revert the T2E hint for ${tradeType} due to EMPTY reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[tradeType];
                        t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        await expectRevert(
                            hintHandler.buildTokenToEthHint(t2eToken, t2eOpcode, [], t2eSplits),
                            'reserveIds cannot be empty'
                        );
                    });

                    it(`should revert the T2E hint for ${tradeType} due to TOKEN IS NOT LISTED for reserveId`, async() => {
                        t2eOpcode = TRADE_TYPES[tradeType];
                        t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
    
                        await expectRevert(
                            hintHandler.buildTokenToEthHint(t2eUnlistedToken, t2eOpcode, t2eReserves, t2eSplits),
                            'token is not listed for reserveId'
                        );
                    });
                }
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert the T2E hint for ${tradeType} due to reserveId NOT FOUND`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    await expectRevert(
                        hintHandler.buildTokenToEthHint(t2eToken, t2eOpcode, t2eMissingReserves, t2eSplits),
                        'reserveId not found'
                    );
                });
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert the T2E hint for ${tradeType} due to invalid split values`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        t2eSplits = [];
                        revertMsg = 'reserveIds.length != splits.length'
                    } else {
                        t2eSplits = BPS_SPLIT;
                        revertMsg = 'splits must be empty';
                    }
                    
                    await expectRevert(
                        hintHandler.buildTokenToEthHint(t2eToken, t2eOpcode, t2eReserves, t2eSplits),
                        revertMsg
                    );
                });
            });

            Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                it(`should revert the T2E hint for SPLIT due to ${invalidSplit}`, async() => {
                    t2eOpcode = SPLIT;
                    t2eSplits = INVALID_SPLIT_BPS[invalidSplit].value;
            
                    await expectRevert(
                        hintHandler.buildTokenToEthHint(t2eToken, t2eOpcode, t2eReserves, t2eSplits),
                        INVALID_SPLIT_BPS[invalidSplit].revertMsg
                    );
                });
            });

            it('should revert the T2E hint for SPLIT due to DUPLICATE reserveIds', async() => {
                t2eOpcode = SPLIT;
                t2eSplits = BPS_SPLIT
                
                await expectRevert(
                    hintHandler.buildTokenToEthHint(t2eToken, t2eOpcode, t2eDupReserves, t2eSplits),
                    'duplicate reserveId'
                );
            });

            it('should revert the T2E hint for invalid hint type', async() => {
                t2eOpcode = INVALID_HINT_TYPE;
                t2eSplits = [];

                try {
                    await hintHandler.buildTokenToEthHint(t2eToken, t2eOpcode, t2eReserves, t2eSplits);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("ETH to Token (E2T)", function() {
            before('one time init of vars', async() => {
                e2tToken = TOKENS[1];
                e2tUnlistedToken = UNLISTED_TOKENS[1];
                e2tReserves = E2T_UNORDERED;
                e2tDupReserves = E2T_DUPLICATES;
                e2tMissingReserves = E2T_MISSING;
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should build the E2T hint for ${tradeType}`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = await hintHandler.buildEthToTokenHint(
                        e2tToken,
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );
                    expected = Helper.buildHint(tradeType)(e2tOpcode, e2tReserves, e2tSplits);
            
                    Helper.assertEqual(hint, expected);
                });

                if (tradeType === 'MASK_OUT') {
                    it('should build the E2T hint for MASK_OUT even if reserveIds is empty', async() => {
                        e2tOpcode = TRADE_TYPES['MASK_OUT'];
                        e2tSplits = [];
                        
                        hint = await hintHandler.buildEthToTokenHint(
                            e2tToken,
                            e2tOpcode,
                            [],
                            e2tSplits,
                        );
                        expected = Helper.buildHint(tradeType)(e2tOpcode, [], e2tSplits);
                
                        Helper.assertEqual(hint, expected);
                    });
                }
            });

            it('should build the E2T BEST-OF-ALL HINT', async() => {
                e2tOpcode = BEST_OF_ALL;
                
                hint = await hintHandler.buildEthToTokenHint(
                    e2tToken,
                    e2tOpcode,
                    [],
                    [],
                );
                expected = Helper.buildHint('BEST_OF_ALL')(e2tOpcode, [], []);
        
                Helper.assertEqual(hint, expected);
            });

            it('should revert the E2T BEST-OF-ALL HINT if reserveIds is NOT EMPTY', async() => {
                e2tOpcode = BEST_OF_ALL;

                await expectRevert(
                    hintHandler.buildEthToTokenHint(
                        e2tToken,
                        e2tOpcode,
                        e2tReserves,
                        [],
                    ),
                    'reserveIds and splits must be empty'
                );
            });

            it('should revert the E2T BEST-OF-ALL HINT if splits is NOT EMPTY', async() => {
                e2tOpcode = BEST_OF_ALL;

                await expectRevert(
                    hintHandler.buildEthToTokenHint(
                        e2tToken,
                        e2tOpcode,
                        [],
                        e2tSplits,
                    ),
                    'reserveIds and splits must be empty'
                );
            });

            it('should revert the E2T BEST-OF-ALL HINT if reserveIds and splits are NOT EMPTY', async() => {
                e2tOpcode = BEST_OF_ALL;

                await expectRevert(
                    hintHandler.buildEthToTokenHint(
                        e2tToken,
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    ),
                    'reserveIds and splits must be empty'
                );
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                if (tradeType !== 'MASK_OUT') {
                    it(`should revert the E2T hint for ${tradeType} due to EMPTY reserveIds`, async() => {
                        e2tOpcode = TRADE_TYPES[tradeType];
                        e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        await expectRevert(
                            hintHandler.buildEthToTokenHint(e2tToken, e2tOpcode, [], e2tSplits),
                            'reserveIds cannot be empty'
                        );
                    });

                    it(`should revert the E2T hint for ${tradeType} due to TOKEN IS NOT LISTED for reserveId`, async() => {
                        e2tOpcode = TRADE_TYPES[tradeType];
                        e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
    
                        await expectRevert(
                            hintHandler.buildEthToTokenHint(e2tUnlistedToken, e2tOpcode, e2tReserves, e2tSplits),
                            'token is not listed for reserveId'
                        );
                    });
                }
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert the E2T hint for ${tradeType} due to reserveId NOT FOUND`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    await expectRevert(
                        hintHandler.buildEthToTokenHint(e2tToken, e2tOpcode, e2tMissingReserves, e2tSplits),
                        'reserveId not found'
                    );
                });
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert the E2T hint for ${tradeType} due to invalid split values`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        e2tSplits = [];
                        revertMsg = 'reserveIds.length != splits.length'
                    } else {
                        e2tSplits = BPS_SPLIT;
                        revertMsg = 'splits must be empty'
                    }
                    
                    await expectRevert(
                        hintHandler.buildEthToTokenHint(e2tToken, e2tOpcode, e2tReserves, e2tSplits),
                        revertMsg
                    );
                });
            });
            
            Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                it(`should revert the E2T hint for SPLIT due to ${invalidSplit}`, async() => {
                    e2tOpcode = SPLIT;
                    e2tSplits = INVALID_SPLIT_BPS[invalidSplit].value;
            
                    await expectRevert(
                        hintHandler.buildEthToTokenHint(e2tToken, e2tOpcode, e2tReserves, e2tSplits),
                        INVALID_SPLIT_BPS[invalidSplit].revertMsg
                    );
                });
            });

            it('should revert the E2T hint for SPLIT due to DUPLICATE reserveIds', async() => {
                e2tOpcode = SPLIT;
                e2tSplits = BPS_SPLIT;

                await expectRevert(
                    hintHandler.buildEthToTokenHint(e2tToken, e2tOpcode, e2tDupReserves, e2tSplits),
                    'duplicate reserveId'
                );
            });

            it('should revert the E2T hint for invalid hint type', async() => {
                e2tOpcode = INVALID_HINT_TYPE;
                e2tSplits = [];

                try {
                    await hintHandler.buildEthToTokenHint(e2tToken, e2tOpcode, e2tReserves, e2tSplits);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("Token to Token (T2T)", function() {
            before('one time init of vars', async() => {
                t2eToken = TOKENS[0];
                e2tToken = TOKENS[1];
                t2eUnlistedToken = UNLISTED_TOKENS[0];
                e2tUnlistedToken = UNLISTED_TOKENS[1];
                t2eReserves = T2E_UNORDERED;
                e2tReserves = E2T_UNORDERED;
                t2eDupReserves = T2E_DUPLICATES;
                e2tDupReserves = E2T_DUPLICATES;
                t2eMissingReserves = T2E_MISSING;
                e2tMissingReserves = E2T_MISSING;
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                    it(`should build the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType}`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = await hintHandler.buildTokenToTokenHint(
                            t2eToken,
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tToken,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );
                        expected = Helper.buildHintT2T(
                            t2eTradeType,
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tTradeType,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );
                
                        Helper.assertEqual(hint, expected);
                    });

                    if (t2eTradeType === 'MASK_OUT') {
                        it(`should build the T2T hint for T2E MASK_OUT, E2T ${e2tTradeType} even if T2E reserveIds is empty`, async() => {
                            t2eOpcode = TRADE_TYPES['MASK_OUT'];
                            t2eSplits = [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            
                            hint = await hintHandler.buildTokenToTokenHint(
                                t2eToken,
                                t2eOpcode,
                                [],
                                t2eSplits,
                                e2tToken,
                                e2tOpcode,
                                e2tReserves,
                                e2tSplits,
                            );
                            expected = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eOpcode,
                                [],
                                t2eSplits,
                                e2tTradeType,
                                e2tOpcode,
                                e2tReserves,
                                e2tSplits,
                            );
                    
                            Helper.assertEqual(hint, expected);
                        });
                    }

                    if (e2tTradeType === 'MASK_OUT') {
                        it(`should build the T2T hint for T2E ${t2eTradeType}, E2T MASK_OUT even if E2T reserveIds is empty`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tOpcode = TRADE_TYPES['MASK_OUT'];
                            e2tSplits = [];
                            
                            hint = await hintHandler.buildTokenToTokenHint(
                                t2eToken,
                                t2eOpcode,
                                t2eReserves,
                                t2eSplits,
                                e2tToken,
                                e2tOpcode,
                                [],
                                e2tSplits,
                            );
                            expected = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eOpcode,
                                t2eReserves,
                                t2eSplits,
                                e2tTradeType,
                                e2tOpcode,
                                [],
                                e2tSplits,
                            );
                    
                            Helper.assertEqual(hint, expected);
                        });
                    }

                    if (t2eTradeType === 'MASK_OUT' && e2tTradeType === 'MASK_OUT') {
                        it('should build the T2T hint for T2E MASK_OUT, E2T MASK_OUT even if T2E & E2T reserveIds is empty', async() => {
                            t2eOpcode = TRADE_TYPES['MASK_OUT'];
                            t2eSplits = [];
                            e2tOpcode = TRADE_TYPES['MASK_OUT'];
                            e2tSplits = [];
                            
                            hint = await hintHandler.buildTokenToTokenHint(
                                t2eToken,
                                t2eOpcode,
                                [],
                                t2eSplits,
                                e2tToken,
                                e2tOpcode,
                                [],
                                e2tSplits,
                            );
                            expected = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eOpcode,
                                [],
                                t2eSplits,
                                e2tTradeType,
                                e2tOpcode,
                                [],
                                e2tSplits,
                            );
                    
                            Helper.assertEqual(hint, expected);
                        });
                    }

                    it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to invalid T2E split values`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];

                        if (t2eTradeType == 'SPLIT') {
                            t2eSplits = [];
                            revertMsg = 'reserveIds.length != splits.length'
                        } else {
                            t2eSplits = BPS_SPLIT;
                            revertMsg = 'splits must be empty'
                        }

                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eToken, t2eOpcode, t2eReserves, t2eSplits,
                                e2tToken, e2tOpcode, e2tReserves, e2tSplits
                            ),
                            revertMsg
                        );
                    });

                    it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to invalid E2T split values`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = [];

                        if (e2tTradeType == 'SPLIT') {
                            e2tSplits = [];
                            revertMsg = 'reserveIds.length != splits.length'
                        } else {
                            e2tSplits = BPS_SPLIT;
                            revertMsg = 'splits must be empty'
                        }
                        
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eToken, t2eOpcode, t2eReserves, t2eSplits,
                                e2tToken, e2tOpcode, e2tReserves, e2tSplits
                            ),
                            revertMsg
                        );
                    });

                    if (t2eTradeType !== 'MASK_OUT') {
                        it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to EMPTY T2E reserveIds`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            
                            await expectRevert(
                                hintHandler.buildTokenToTokenHint(
                                    t2eToken, t2eOpcode, [], t2eSplits,
                                    e2tToken, e2tOpcode, e2tReserves, e2tSplits,
                                ),
                                'reserveIds cannot be empty'
                            );
                        });

                        it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E TOKEN IS NOT LISTED for reserveId`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
        
                            await expectRevert(
                                hintHandler.buildTokenToTokenHint(
                                    t2eUnlistedToken, t2eOpcode, t2eReserves, t2eSplits,
                                    e2tToken, e2tOpcode, e2tReserves, e2tSplits,
                                ),
                                'token is not listed for reserveId'
                            );
                        });
                    }

                    if (e2tTradeType !== 'MASK_OUT') {
                        it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to EMPTY E2T reserveIds`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            
                            await expectRevert(
                                hintHandler.buildTokenToTokenHint(
                                    t2eToken, t2eOpcode, t2eReserves, t2eSplits,
                                    e2tToken, e2tOpcode, [], e2tSplits,
                                ),
                                'reserveIds cannot be empty'
                            );
                        });

                        it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to E2T TOKEN IS NOT LISTED for reserveId`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
        
                            await expectRevert(
                                hintHandler.buildTokenToTokenHint(
                                    t2eToken, t2eOpcode, t2eReserves, t2eSplits,
                                    e2tUnlistedToken, e2tOpcode, e2tReserves, e2tSplits,
                                ),
                                'token is not listed for reserveId'
                            );
                        });
                    }

                    if (t2eTradeType !== 'MASK_OUT' && e2tTradeType !== 'MASK_OUT') {
                        it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E & E2T EMPTY reserveIds`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            
                            await expectRevert(
                                hintHandler.buildTokenToTokenHint(
                                    t2eToken, t2eOpcode, [], t2eSplits,
                                    e2tToken, e2tOpcode, [], e2tSplits,
                                ),
                                'reserveIds cannot be empty'
                            );
                        });

                        it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E & E2T TOKEN IS NOT LISTED for reserveId`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
        
                            await expectRevert(
                                hintHandler.buildTokenToTokenHint(
                                    t2eUnlistedToken, t2eOpcode, t2eReserves, t2eSplits,
                                    e2tUnlistedToken, e2tOpcode, e2tReserves, e2tSplits,
                                ),
                                'token is not listed for reserveId'
                            );
                        });
                    }

                    it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E reserveId NOT FOUND`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eToken, t2eOpcode, t2eMissingReserves, t2eSplits,
                                e2tToken, e2tOpcode, e2tReserves, e2tSplits,
                            ),
                            'reserveId not found'
                        );
                    });

                    it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to E2T reserveId NOT FOUND`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eToken, t2eOpcode, t2eReserves, t2eSplits,
                                e2tToken, e2tOpcode, e2tMissingReserves, e2tSplits,
                            ),
                            'reserveId not found'
                        );
                    });

                    it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E & E2T reserveId NOT FOUND`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eToken, t2eOpcode, t2eMissingReserves, t2eSplits,
                                e2tToken, e2tOpcode, e2tMissingReserves, e2tSplits,
                            ),
                            'reserveId not found'
                        );
                    });
                });
            });

            Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                it(`should build the T2T hint for T2E BEST-OF-ALL HINT, E2T ${e2tTradeType}`, async() => {
                    t2eOpcode = BEST_OF_ALL;
                    e2tOpcode = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = await hintHandler.buildTokenToTokenHint(
                        t2eToken,
                        t2eOpcode,
                        [],
                        [],
                        e2tToken,
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );
                    expected = Helper.buildHintT2T(
                        'BEST_OF_ALL',
                        t2eOpcode,
                        [],
                        [],
                        e2tTradeType,
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );
            
                    Helper.assertEqual(hint, expected);
                });
    
                it(`should revert the T2T hint for T2E BEST-OF-ALL HINT, E2T ${e2tTradeType} if T2E reserveIds is NOT EMPTY`, async() => {
                    t2eOpcode = BEST_OF_ALL;
                    e2tOpcode = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];

                    await expectRevert(
                        hintHandler.buildTokenToTokenHint(
                            t2eToken,
                            t2eOpcode,
                            t2eReserves,
                            [],
                            e2tToken,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        ),
                        'reserveIds and splits must be empty'
                    );
                });

                it(`should revert the T2T hint for T2E BEST-OF-ALL HINT, E2T ${e2tTradeType} if T2E splits is NOT EMPTY`, async() => {
                    t2eOpcode = BEST_OF_ALL;
                    e2tOpcode = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];

                    await expectRevert(
                        hintHandler.buildTokenToTokenHint(
                            t2eToken,
                            t2eOpcode,
                            [],
                            t2eSplits,
                            e2tToken,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        ),
                        'reserveIds and splits must be empty'
                    );
                });

                it(`should revert the T2T hint for T2E BEST-OF-ALL HINT, E2T ${e2tTradeType} if T2E reserveIds and splits are NOT EMPTY`, async() => {
                    t2eOpcode = BEST_OF_ALL;
                    e2tOpcode = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];

                    await expectRevert(
                        hintHandler.buildTokenToTokenHint(
                            t2eToken,
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tToken,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        ),
                        'reserveIds and splits must be empty'
                    );
                });
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                it(`should build the T2T hint for T2E ${t2eTradeType}, E2T BEST-OF-ALL HINT`, async() => {
                    t2eOpcode = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tOpcode = BEST_OF_ALL;
                    
                    hint = await hintHandler.buildTokenToTokenHint(
                        t2eToken,
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                        e2tToken,
                        e2tOpcode,
                        [],
                        [],
                    );
                    expected = Helper.buildHintT2T(
                        t2eTradeType,
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                        'BEST_OF_ALL',
                        e2tOpcode,
                        [],
                        [],
                    );
            
                    Helper.assertEqual(hint, expected);
                });
    
                it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T BEST-OF-ALL HINT if E2T reserveIds is NOT EMPTY`, async() => {
                    t2eOpcode = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tOpcode = BEST_OF_ALL;
                    
                    await expectRevert(
                        hintHandler.buildTokenToTokenHint(
                            t2eToken,
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tToken,
                            e2tOpcode,
                            e2tReserves,
                            [],
                        ),
                        'reserveIds and splits must be empty'
                    );
                });

                it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T BEST-OF-ALL HINT if E2T splits is NOT EMPTY`, async() => {
                    t2eOpcode = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tOpcode = BEST_OF_ALL;
                    
                    await expectRevert(
                        hintHandler.buildTokenToTokenHint(
                            t2eToken,
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tToken,
                            e2tOpcode,
                            [],
                            e2tSplits,
                        ),
                        'reserveIds and splits must be empty'
                    );
                });

                it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T BEST-OF-ALL HINT if E2T reserveIds and splits are NOT EMPTY`, async() => {
                    t2eOpcode = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tOpcode = BEST_OF_ALL;
                    
                    await expectRevert(
                        hintHandler.buildTokenToTokenHint(
                            t2eToken,
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tToken,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        ),
                        'reserveIds and splits must be empty'
                    );
                });
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                    it(`should revert the T2T hint for T2E SPLIT, E2T ${tradeType} due to T2E ${invalidSplit}`, async() => {
                        t2eOpcode = SPLIT;
                        t2eSplits = INVALID_SPLIT_BPS[invalidSplit].value;
                        e2tOpcode = TRADE_TYPES[tradeType];
                        e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eToken, t2eOpcode, t2eReserves, t2eSplits,
                                e2tToken, e2tOpcode, e2tReserves, e2tSplits
                            ),
                            INVALID_SPLIT_BPS[invalidSplit].revertMsg
                        );
                    });
                });

                it(`should revert the T2T hint for T2E ${tradeType}, E2T SPLIT due to DUPLICATE E2T reserveIDs`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tOpcode = SPLIT;
                    e2tSplits = BPS_SPLIT;
                    
                    await expectRevert(
                        hintHandler.buildTokenToTokenHint(
                            t2eToken, t2eOpcode, t2eReserves, t2eSplits,
                            e2tToken, e2tOpcode, e2tDupReserves, e2tSplits,
                        ),
                        'duplicate reserveId'
                    );
                });

                it(`should revert the T2T hint for T2E ${tradeType} due to INVALID E2T hint type`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    e2tOpcode = INVALID_HINT_TYPE; // trade type does not exist
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
            
                    try {
                        await hintHandler.buildTokenToTokenHint(
                            t2eToken, t2eOpcode, t2eReserves, t2eSplits,
                            e2tToken, e2tOpcode, e2tReserves, e2tSplits
                        );
                    } catch(e) {
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });

                Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                    it(`should revert the T2T hint for T2E ${tradeType}, E2T SPLIT due to E2T ${invalidSplit}`, async() => {
                        t2eOpcode = TRADE_TYPES[tradeType];
                        t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = SPLIT;
                        e2tSplits = INVALID_SPLIT_BPS[invalidSplit].value;
                
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eToken, t2eOpcode, t2eReserves, t2eSplits,
                                e2tToken, e2tOpcode, e2tReserves, e2tSplits
                            ),
                            INVALID_SPLIT_BPS[invalidSplit].revertMsg
                        );
                    });
                });

                it(`should revert the T2T hint for E2T ${tradeType} due to DUPLICATE T2E reserveIDs`, async() => {
                    t2eOpcode = SPLIT;
                    t2eSplits = BPS_SPLIT;
                    e2tOpcode = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    await expectRevert(
                        hintHandler.buildTokenToTokenHint(
                            t2eToken, t2eOpcode, t2eDupReserves, t2eSplits,
                            e2tToken, e2tOpcode, e2tReserves, e2tSplits,
                        ),
                        'duplicate reserveId'
                    );
                });

                it(`should revert the T2T hint for E2T ${tradeType} due to INVALID T2E hint type`, async() => {
                    t2eOpcode = INVALID_HINT_TYPE; // trade type does not exist
                    t2eSplits = [];
                    e2tOpcode = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
            
                    try {
                        await hintHandler.buildTokenToTokenHint(
                                t2eToken, t2eOpcode, t2eReserves, t2eSplits,
                                e2tToken, e2tOpcode, e2tReserves, e2tSplits
                            );
                    } catch(e) {
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });
            });
        });
    });

    describe("test parsing various hints", function() {
        describe("Token to ETH (T2E)", function() {
            before('one time init of vars', async() => {
                t2eToken = TOKENS[0];
                t2eReserves = T2E_UNORDERED;
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should parse the T2E hint for ${tradeType}`, async() => {
                    t2eHintType = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];

                    hint = Helper.buildHint(tradeType)(t2eHintType, t2eReserves, t2eSplits);
            
                    actual = await hintHandler.parseTokenToEthHint(t2eToken, hint);
                    expected = parseHint(hint);
    
                    Helper.assertEqual(actual.tokenToEthType, expected.tradeType);
                    assert.deepEqual(actual.tokenToEthReserveIds, expected.reserveIds);
                    assert.deepEqual(actual.tokenToEthAddresses, expected.addresses);
                    Helper.assertEqual(actual.tokenToEthSplits, expected.splits);
                });

                if (tradeType === 'MASK_OUT') {
                    it('should parse the T2E hint for MASK_OUT even if reserveIds is empty', async() => {
                        t2eHintType = TRADE_TYPES['MASK_OUT'];
                        t2eSplits = [];
    
                        hint = Helper.buildHint(tradeType)(t2eHintType, [], t2eSplits);
                
                        actual = await hintHandler.parseTokenToEthHint(t2eToken, hint);
                        expected = parseHint(hint);
        
                        Helper.assertEqual(actual.tokenToEthType, expected.tradeType);
                        assert.deepEqual(actual.tokenToEthReserveIds, expected.reserveIds);
                        assert.deepEqual(actual.tokenToEthAddresses, expected.addresses);
                        Helper.assertEqual(actual.tokenToEthSplits, expected.splits);
                    });
                }
            });

            it('should parse the T2E BEST-OF-ALL HINT', async() => {
                t2eHintType = BEST_OF_ALL;

                hint = Helper.buildHint('BEST_OF_ALL')(t2eHintType, [], []);
                
                actual = await hintHandler.parseTokenToEthHint(t2eToken, hint);
                expected = parseHint(hint);
        
                Helper.assertEqual(actual.tokenToEthType, expected.tradeType);
                assert.deepEqual(actual.tokenToEthReserveIds, expected.reserveIds);
                assert.deepEqual(actual.tokenToEthAddresses, expected.addresses);
                Helper.assertEqual(actual.tokenToEthSplits, expected.splits);
            });
        });

        describe("ETH to Token (E2T)", function() {
            before('one time init of vars', async() => {
                e2tToken = TOKENS[1];
                e2tReserves = E2T_UNORDERED;
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should parse the E2T hint for ${tradeType}`, async() => {
                    e2tHintType = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];

                    hint = Helper.buildHint(tradeType)(e2tHintType, e2tReserves, e2tSplits);
            
                    actual = await hintHandler.parseEthToTokenHint(e2tToken, hint);
                    expected = parseHint(hint);
    
                    Helper.assertEqual(actual.ethToTokenType, expected.tradeType);
                    assert.deepEqual(actual.ethToTokenReserveIds, expected.reserveIds);
                    assert.deepEqual(actual.ethToTokenAddresses, expected.addresses);
                    Helper.assertEqual(actual.ethToTokenSplits, expected.splits);
                });

                if (tradeType === 'MASK_OUT') {
                    it('should parse the E2T hint for MASK_OUT even if reserveIds is empty', async() => {
                        e2tHintType = TRADE_TYPES['MASK_OUT'];
                        e2tSplits = [];
    
                        hint = Helper.buildHint(tradeType)(e2tHintType, [], e2tSplits);
            
                        actual = await hintHandler.parseEthToTokenHint(e2tToken, hint);
                        expected = parseHint(hint);
        
                        Helper.assertEqual(actual.ethToTokenType, expected.tradeType);
                        assert.deepEqual(actual.ethToTokenReserveIds, expected.reserveIds);
                        assert.deepEqual(actual.ethToTokenAddresses, expected.addresses);
                        Helper.assertEqual(actual.ethToTokenSplits, expected.splits);
                    });
                }
            });

            it('should parse the E2T BEST-OF-ALL HINT', async() => {
                e2tHintType = BEST_OF_ALL;

                hint = Helper.buildHint('BEST_OF_ALL')(e2tHintType, [], []);
                
                actual = await hintHandler.parseEthToTokenHint(e2tToken, hint);
                expected = parseHint(hint);
        
                Helper.assertEqual(actual.ethToTokenType, expected.tradeType);
                assert.deepEqual(actual.ethToTokenReserveIds, expected.reserveIds);
                assert.deepEqual(actual.ethToTokenAddresses, expected.addresses);
                Helper.assertEqual(actual.ethToTokenSplits, expected.splits);
            });
        });

        describe("Token to Token (T2T)", function() {
            before('one time init of vars', async() => {
                t2eToken = TOKENS[0];
                e2tToken = TOKENS[1];
                t2eReserves = T2E_UNORDERED;
                e2tReserves = E2T_UNORDERED;
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                    it(`should parse the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType}`, async() => {
                        t2eHintType = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tHintType = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];

                        hint = Helper.buildHintT2T(
                            t2eTradeType,
                            t2eHintType,
                            t2eReserves,
                            t2eSplits,
                            e2tTradeType,
                            e2tHintType,
                            e2tReserves,
                            e2tSplits,
                        );
                
                        actual = await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                        hints = unpackT2T(hint);
                        expectedT2E = parseHint(hints.t2eHint);
                        expectedE2T = parseHint(hints.e2tHint);
        
                        Helper.assertEqual(actual.tokenToEthType, expectedT2E.tradeType);
                        assert.deepEqual(actual.tokenToEthReserveIds, expectedT2E.reserveIds);
                        assert.deepEqual(actual.tokenToEthAddresses, expectedT2E.addresses);
                        Helper.assertEqual(actual.tokenToEthSplits, expectedT2E.splits);
                        Helper.assertEqual(actual.ethToTokenType, expectedE2T.tradeType);
                        assert.deepEqual(actual.ethToTokenReserveIds, expectedE2T.reserveIds);
                        assert.deepEqual(actual.ethToTokenAddresses, expectedE2T.addresses);
                        Helper.assertEqual(actual.ethToTokenSplits, expectedE2T.splits);
                    });

                    if (t2eTradeType === 'MASK_OUT') {
                        it(`should parse the T2T hint for T2E MASK_OUT, E2T ${e2tTradeType} even if T2E reserveIds is empty`, async() => {
                            t2eHintType = TRADE_TYPES['MASK_OUT'];
                            t2eSplits = [];
                            e2tHintType = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];

                            hint = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eHintType,
                                [],
                                t2eSplits,
                                e2tTradeType,
                                e2tHintType,
                                e2tReserves,
                                e2tSplits,
                            );
                    
                            actual = await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                            hints = unpackT2T(hint);
                            expectedT2E = parseHint(hints.t2eHint);
                            expectedE2T = parseHint(hints.e2tHint);
            
                            Helper.assertEqual(actual.tokenToEthType, expectedT2E.tradeType);
                            assert.deepEqual(actual.tokenToEthReserveIds, expectedT2E.reserveIds);
                            assert.deepEqual(actual.tokenToEthAddresses, expectedT2E.addresses);
                            Helper.assertEqual(actual.tokenToEthSplits, expectedT2E.splits);
                            Helper.assertEqual(actual.ethToTokenType, expectedE2T.tradeType);
                            assert.deepEqual(actual.ethToTokenReserveIds, expectedE2T.reserveIds);
                            assert.deepEqual(actual.ethToTokenAddresses, expectedE2T.addresses);
                            Helper.assertEqual(actual.ethToTokenSplits, expectedE2T.splits);
                        });
                    }

                    if (e2tTradeType === 'MASK_OUT') {
                        it(`should parse the T2T hint for T2E ${t2eTradeType}, E2T MASK_OUT even if E2T reserveIds is empty`, async() => {
                            t2eHintType = TRADE_TYPES[e2tTradeType];
                            t2eSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tHintType = TRADE_TYPES['MASK_OUT'];
                            e2tSplits = [];

                            hint = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eHintType,
                                t2eReserves,
                                t2eSplits,
                                e2tTradeType,
                                e2tHintType,
                                [],
                                e2tSplits,
                            );
                    
                            actual = await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                            hints = unpackT2T(hint);
                            expectedT2E = parseHint(hints.t2eHint);
                            expectedE2T = parseHint(hints.e2tHint);
            
                            Helper.assertEqual(actual.tokenToEthType, expectedT2E.tradeType);
                            assert.deepEqual(actual.tokenToEthReserveIds, expectedT2E.reserveIds);
                            assert.deepEqual(actual.tokenToEthAddresses, expectedT2E.addresses);
                            Helper.assertEqual(actual.tokenToEthSplits, expectedT2E.splits);
                            Helper.assertEqual(actual.ethToTokenType, expectedE2T.tradeType);
                            assert.deepEqual(actual.ethToTokenReserveIds, expectedE2T.reserveIds);
                            assert.deepEqual(actual.ethToTokenAddresses, expectedE2T.addresses);
                            Helper.assertEqual(actual.ethToTokenSplits, expectedE2T.splits);
                        });
                    }

                    if (t2eTradeType === 'MASK_OUT' && e2tTradeType === 'MASK_OUT') {
                        it('should parse the T2T hint for T2E MASK_OUT, E2T MASK_OUT even if E2T reserveIds is empty', async() => {
                            t2eHintType = TRADE_TYPES['MASK_OUT'];
                            t2eSplits = [];
                            e2tHintType = TRADE_TYPES['MASK_OUT'];
                            e2tSplits = [];

                            hint = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eHintType,
                                [],
                                t2eSplits,
                                e2tTradeType,
                                e2tHintType,
                                [],
                                e2tSplits,
                            );
                    
                            actual = await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                            hints = unpackT2T(hint);
                            expectedT2E = parseHint(hints.t2eHint);
                            expectedE2T = parseHint(hints.e2tHint);
            
                            Helper.assertEqual(actual.tokenToEthType, expectedT2E.tradeType);
                            assert.deepEqual(actual.tokenToEthReserveIds, expectedT2E.reserveIds);
                            assert.deepEqual(actual.tokenToEthAddresses, expectedT2E.addresses);
                            Helper.assertEqual(actual.tokenToEthSplits, expectedT2E.splits);
                            Helper.assertEqual(actual.ethToTokenType, expectedE2T.tradeType);
                            assert.deepEqual(actual.ethToTokenReserveIds, expectedE2T.reserveIds);
                            assert.deepEqual(actual.ethToTokenAddresses, expectedE2T.addresses);
                            Helper.assertEqual(actual.ethToTokenSplits, expectedE2T.splits);
                        });
                    }
                });
            });
            
            Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                it(`should parse the T2T hint for T2E BEST-OF-ALL HINT, E2T ${e2tTradeType}`, async() => {
                    t2eHintType = BEST_OF_ALL;
                    e2tHintType = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];

                    hint = Helper.buildHintT2T(
                        'BEST_OF_ALL',
                        t2eHintType,
                        [],
                        [],
                        e2tTradeType,
                        e2tHintType,
                        e2tReserves,
                        e2tSplits,
                    );
            
                    actual = await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                    hints = unpackT2T(hint);
                    expectedT2E = parseHint(hints.t2eHint);
                    expectedE2T = parseHint(hints.e2tHint);
    
                    Helper.assertEqual(actual.tokenToEthType, expectedT2E.tradeType);
                    assert.deepEqual(actual.tokenToEthReserveIds, expectedT2E.reserveIds);
                    assert.deepEqual(actual.tokenToEthAddresses, expectedT2E.addresses);
                    Helper.assertEqual(actual.tokenToEthSplits, expectedT2E.splits);
                    Helper.assertEqual(actual.ethToTokenType, expectedE2T.tradeType);
                    assert.deepEqual(actual.ethToTokenReserveIds, expectedE2T.reserveIds);
                    assert.deepEqual(actual.ethToTokenAddresses, expectedE2T.addresses);
                    Helper.assertEqual(actual.ethToTokenSplits, expectedE2T.splits);
                });
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                it(`should parse the T2T hint for T2E ${t2eTradeType}, E2T BEST-OF-ALL HINT`, async() => {
                    t2eHintType = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tHintType = BEST_OF_ALL;

                    hint = Helper.buildHintT2T(
                        t2eTradeType,
                        t2eHintType,
                        t2eReserves,
                        t2eSplits,
                        'BEST_OF_ALL',
                        e2tHintType,
                        [],
                        [],
                    );
            
                    actual = await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                    hints = unpackT2T(hint);
                    expectedT2E = parseHint(hints.t2eHint);
                    expectedE2T = parseHint(hints.e2tHint);
    
                    Helper.assertEqual(actual.tokenToEthType, expectedT2E.tradeType);
                    assert.deepEqual(actual.tokenToEthReserveIds, expectedT2E.reserveIds);
                    assert.deepEqual(actual.tokenToEthAddresses, expectedT2E.addresses);
                    Helper.assertEqual(actual.tokenToEthSplits, expectedT2E.splits);
                    Helper.assertEqual(actual.ethToTokenType, expectedE2T.tradeType);
                    assert.deepEqual(actual.ethToTokenReserveIds, expectedE2T.reserveIds);
                    assert.deepEqual(actual.ethToTokenAddresses, expectedE2T.addresses);
                    Helper.assertEqual(actual.ethToTokenSplits, expectedE2T.splits);
                });
            });
        });
    });

    describe("test parsing various incorrect hints", function() {
        describe("Token to ETH (T2E)", function() {
            before('one time init of vars', async() => {
                t2eToken = TOKENS[0];
                t2eUnlistedToken = UNLISTED_TOKENS[0];
                t2eReserves = T2E_UNORDERED;
                t2eDupReserves = T2E_DUPLICATES;
                t2eMissingReserves = T2E_MISSING;
            });

            it('should revert the T2E BEST-OF-ALL HINT due to reserveIds not empty', async() => {
                t2eHintType = BEST_OF_ALL;
                t2eSplits = BPS_SPLIT;

                hint = Helper.buildHint('BEST_OF_ALL')(t2eHintType, t2eReserves, []);
                
                await expectRevert(
                    hintHandler.parseTokenToEthHint(t2eToken, hint),
                    'reserveIds and splits must be empty'
                );
            });

            it('should revert the T2E BEST-OF-ALL HINT due to splits not empty', async() => {
                t2eHintType = BEST_OF_ALL;
                t2eSplits = BPS_SPLIT;

                hint = Helper.buildHint('BEST_OF_ALL')(t2eHintType, [], t2eSplits);
                
                await expectRevert(
                    hintHandler.parseTokenToEthHint(t2eToken, hint),
                    'reserveIds and splits must be empty'
                );
            });

            it('should revert the T2E BEST-OF-ALL HINT due to reserveIds and splits not empty', async() => {
                t2eHintType = BEST_OF_ALL;
                t2eSplits = BPS_SPLIT;

                hint = Helper.buildHint('BEST_OF_ALL')(t2eHintType, t2eReserves, t2eSplits);
                
                await expectRevert(
                    hintHandler.parseTokenToEthHint(t2eToken, hint),
                    'reserveIds and splits must be empty'
                );
            });
            
            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert for T2E hint for ${tradeType} due to RANDOM HEX for reservesIds`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = Helper.buildHint(tradeType)(t2eOpcode, randomHex32(t2eReserves.length), t2eSplits);

                    try {
                        await hintHandler.parseTokenToEthHint(t2eToken, hint);
                    } catch(e) {
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });

                it(`should revert for T2E hint for ${tradeType} due to invalid split value`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        t2eSplits = [];
                        revertMsg = 'reserveIds.length != splits.length';
                    } else {
                        t2eSplits = BPS_SPLIT;
                        revertMsg = 'splits must be empty';
                    }
                    
                    hint = Helper.buildHint(tradeType)(t2eOpcode, t2eReserves, t2eSplits);            

                    await expectRevert(
                        hintHandler.parseTokenToEthHint(t2eToken, hint),
                        revertMsg
                    );
                });

                if (tradeType !== 'MASK_OUT') {
                    it(`should revert for T2E hint for ${tradeType} due to EMPTY reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[tradeType];
                        t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = Helper.buildHint(tradeType)(t2eOpcode, [], t2eSplits);
    
                        await expectRevert(
                            hintHandler.parseTokenToEthHint(t2eToken, hint),
                            'reserveIds cannot be empty'
                        );
                    });

                    it(`should revert the T2E hint for ${tradeType} due to TOKEN IS NOT LISTED for reserveId`, async() => {
                        t2eOpcode = TRADE_TYPES[tradeType];
                        t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];

                        hint = Helper.buildHint(tradeType)(t2eOpcode, t2eReserves, t2eSplits);
    
                        await expectRevert(
                            hintHandler.parseTokenToEthHint(t2eUnlistedToken, hint),
                            'token is not listed for reserveId'
                        );
                    });
                }

                it(`should revert for T2E hint for ${tradeType} due to reserveId NOT FOUND`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = Helper.buildHint(tradeType)(t2eOpcode, t2eMissingReserves, t2eSplits);

                    await expectRevert(
                        hintHandler.parseTokenToEthHint(t2eToken, hint),
                        'reserveId not found'
                    );
                });

                it(`should revert for T2E hint for ${tradeType} due to DUPLICATE reserveIds`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
    
                    hint = Helper.buildHint(tradeType)(t2eOpcode, t2eDupReserves, t2eSplits);
                    
                    await expectRevert(
                        hintHandler.parseTokenToEthHint(t2eToken, hint),
                        'duplicate reserveId'
                    );
                });
            });

            it('should revert for T2E hint for SPLIT due to reserveIds NOT IN INCREASING ORDER', async() => {
                t2eOpcode = SPLIT;
                t2eSplits = BPS_SPLIT;

                hint = Helper.buildHint()(t2eOpcode, t2eReserves, t2eSplits);

                await expectRevert(
                    hintHandler.parseTokenToEthHint(t2eToken, hint),
                    'reserveIds not in increasing order'
                );
            });

            Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                it(`should revert for T2E hint for SPLIT due to ${invalidSplit}`, async() => {
                    t2eOpcode = SPLIT;
                    t2eSplits = INVALID_SPLIT_BPS[invalidSplit].value;
            
                    hint = Helper.buildHint('SPLIT')(t2eOpcode, t2eReserves, t2eSplits);            
                    
                    await expectRevert(
                        hintHandler.parseTokenToEthHint(t2eToken, hint),
                        INVALID_SPLIT_BPS[invalidSplit].revertMsg
                    );
                });
            });

            it('should revert for T2E hint for SPLIT due to RANDOM HEX for splits', async() => {
                t2eOpcode = SPLIT;
                t2eSplits = randomHex32(BPS_SPLIT.length);
                
                hint = Helper.buildHint('SPLIT')(t2eOpcode, t2eReserves, t2eSplits);

                try {
                    await hintHandler.parseTokenToEthHint(t2eToken, hint);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });

            it('should revert the T2E hint for RANDOM HEX HINT TYPE', async() => {
                t2eOpcode = web3.utils.randomHex(32);
                t2eSplits = [];

                hint = Helper.buildHint()(t2eOpcode, t2eReserves, t2eSplits);
                
                try {
                    await hintHandler.parseTokenToEthHint(t2eToken, hint);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });

            it('should revert the T2E hint for invalid hint type', async() => {
                t2eOpcode = INVALID_HINT_TYPE;
                t2eSplits = [];

                hint = Helper.buildHint()(t2eOpcode, t2eReserves, t2eSplits);
                
                try {
                    await hintHandler.parseTokenToEthHint(t2eToken, hint);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("ETH to Token (E2T)", function() {
            before('one time init of vars', async() => {
                e2tToken = TOKENS[1];
                e2tUnlistedToken = UNLISTED_TOKENS[1];
                e2tReserves = E2T_UNORDERED;
                e2tDupReserves = E2T_DUPLICATES;
                e2tMissingReserves = E2T_MISSING;
            });

            it('should revert the E2T BEST-OF-ALL HINT due to reserveIds not empty', async() => {
                e2tHintType = BEST_OF_ALL;
                e2tSplits = BPS_SPLIT;

                hint = Helper.buildHint('BEST_OF_ALL')(e2tHintType, e2tReserves, []);
                
                await expectRevert(
                    hintHandler.parseEthToTokenHint(e2tToken, hint),
                    'reserveIds and splits must be empty'
                );
            });

            it('should revert the E2T BEST-OF-ALL HINT due to splits not empty', async() => {
                e2tHintType = BEST_OF_ALL;
                e2tSplits = BPS_SPLIT;

                hint = Helper.buildHint('BEST_OF_ALL')(e2tHintType, [], e2tSplits);
                
                await expectRevert(
                    hintHandler.parseEthToTokenHint(e2tToken, hint),
                    'reserveIds and splits must be empty'
                );
            });

            it('should revert the E2T BEST-OF-ALL HINT due to reserveIds and splits not empty', async() => {
                e2tHintType = BEST_OF_ALL;
                e2tSplits = BPS_SPLIT;

                hint = Helper.buildHint('BEST_OF_ALL')(e2tHintType, e2tReserves, e2tSplits);
                
                await expectRevert(
                    hintHandler.parseEthToTokenHint(e2tToken, hint),
                    'reserveIds and splits must be empty'
                );
            });
            
            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert for E2T hint for ${tradeType} due to RANDOM HEX for reservesIds`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = Helper.buildHint(tradeType)(e2tOpcode, randomHex32(t2eReserves.length), e2tSplits);

                    try {
                        await hintHandler.parseEthToTokenHint(e2tToken, hint);
                    } catch(e) {
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });

                it(`should revert for E2T hint for ${tradeType} due to invalid split value`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        e2tSplits = [];
                        revertMsg = 'reserveIds.length != splits.length';
                    } else {
                        e2tSplits = BPS_SPLIT;
                        revertMsg = 'splits must be empty';
                    }
                    
                    hint = Helper.buildHint(tradeType)(e2tOpcode, e2tReserves, e2tSplits);
                    
                    await expectRevert(
                        hintHandler.parseEthToTokenHint(e2tToken, hint),
                        revertMsg
                    );
                });

                if (tradeType !== 'MASK_OUT') {
                    it(`should revert for E2T hint for ${tradeType} due to EMPTY reserveIds`, async() => {
                        e2tOpcode = TRADE_TYPES[tradeType];
                        e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = Helper.buildHint(tradeType)(e2tOpcode, [], e2tSplits);
                        
                        await expectRevert(
                            hintHandler.parseEthToTokenHint(e2tToken, hint),
                            'reserveIds cannot be empty'
                        );
                    });

                    it(`should revert the E2T hint for ${tradeType} due to TOKEN IS NOT LISTED for reserveId`, async() => {
                        e2tOpcode = TRADE_TYPES[tradeType];
                        e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = Helper.buildHint(tradeType)(e2tOpcode, e2tReserves, e2tSplits);
    
                        await expectRevert(
                            hintHandler.parseEthToTokenHint(e2tUnlistedToken, hint),
                            'token is not listed for reserveId'
                        );
                    });
                }

                it(`should revert for E2T hint for ${tradeType} due to reserveId NOT FOUND`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = Helper.buildHint(tradeType)(e2tOpcode, e2tMissingReserves, e2tSplits);
                    
                    await expectRevert(
                        hintHandler.parseEthToTokenHint(e2tToken, hint),
                        'reserveId not found'
                    );
                });
                
                it(`should revert for E2T hint for ${tradeType} due to DUPLICATE reserveIds`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
    
                    hint = Helper.buildHint(tradeType)(e2tOpcode, e2tDupReserves, e2tSplits);
                    
                    await expectRevert(
                        hintHandler.parseEthToTokenHint(e2tToken, hint),
                        'duplicate reserveId'
                    );
                });
            });

            it('should revert for E2T hint for SPLIT due to reserveIds NOT IN INCREASING ORDER', async() => {
                e2tOpcode = SPLIT;
                e2tSplits = BPS_SPLIT;

                hint = Helper.buildHint()(e2tOpcode, e2tReserves, e2tSplits);

                await expectRevert(
                    hintHandler.parseEthToTokenHint(e2tToken, hint),
                    'reserveIds not in increasing order'
                );
            });

            Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                it(`should revert for E2T hint for SPLIT due to ${invalidSplit}`, async() => {
                    e2tOpcode = SPLIT;
                    e2tSplits = INVALID_SPLIT_BPS[invalidSplit].value;
            
                    hint = Helper.buildHint('SPLIT')(e2tOpcode, e2tReserves, e2tSplits);
                    
                    await expectRevert(
                        hintHandler.parseEthToTokenHint(e2tToken, hint),
                        INVALID_SPLIT_BPS[invalidSplit].revertMsg
                    );
                });
            });

            it('should revert for E2T hint for SPLIT due to RANDOM HEX for splits', async() => {
                e2tOpcode = SPLIT;
                e2tSplits = randomHex32(BPS_SPLIT.length);
                
                hint = Helper.buildHint('SPLIT')(e2tOpcode, e2tReserves, e2tSplits);

                try {
                    await hintHandler.parseEthToTokenHint(e2tToken, hint);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });

            it('should revert the E2T hint for RANDOM HEX HINT TYPE', async() => {
                e2tOpcode = web3.utils.randomHex(32);
                e2tSplits = [];

                hint = Helper.buildHint()(e2tOpcode, e2tReserves, e2tSplits);
                
                try {
                    await hintHandler.parseEthToTokenHint(e2tToken, hint);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });

            it('should revert the E2T hint for invalid hint type', async() => {
                e2tOpcode = INVALID_HINT_TYPE;
                e2tSplits = [];

                hint = Helper.buildHint()(e2tOpcode, e2tReserves, e2tSplits);
                
                try {
                    await hintHandler.parseEthToTokenHint(e2tToken, hint);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("Token to Token (T2T)", function() {
            before('one time init of vars', async() => {
                t2eToken = TOKENS[0];
                e2tToken = TOKENS[1];
                t2eUnlistedToken = UNLISTED_TOKENS[0];
                e2tUnlistedToken = UNLISTED_TOKENS[1];
                t2eReserves = T2E_UNORDERED;
                e2tReserves = E2T_UNORDERED;
                t2eDupReserves = T2E_DUPLICATES;
                e2tDupReserves = E2T_DUPLICATES;
                t2eMissingReserves = T2E_MISSING;
                e2tMissingReserves = E2T_MISSING;
                t2eAscendingReserves = T2E_ORDERED;
                e2tAscendingReserves = E2T_ORDERED;
            });

            Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                it(`should revert the T2T hint for T2E BEST-OF-ALL HINT, E2T ${e2tTradeType} due to T2E reserveIds not empty`, async() => {
                    t2eHintType = BEST_OF_ALL;
                    t2eSplits = [];
                    e2tHintType = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];

                    hint = Helper.buildHintT2T(
                        'BEST_OF_ALL',
                        t2eHintType,
                        t2eReserves,
                        t2eSplits,
                        e2tTradeType,
                        e2tHintType,
                        e2tReserves,
                        e2tSplits,
                    );

                    await expectRevert(
                        hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                        'reserveIds and splits must be empty'
                    );
                });

                it(`should revert the T2T hint for T2E BEST-OF-ALL HINT, E2T ${e2tTradeType} due to T2E splits not empty`, async() => {
                    t2eHintType = BEST_OF_ALL;
                    t2eSplits = BPS_SPLIT;
                    e2tHintType = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];

                    hint = Helper.buildHintT2T(
                        'BEST_OF_ALL',
                        t2eHintType,
                        [],
                        t2eSplits,
                        e2tTradeType,
                        e2tHintType,
                        e2tReserves,
                        e2tSplits,
                    );

                    await expectRevert(
                        hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                        'reserveIds and splits must be empty'
                    );
                });

                it(`should revert the T2T hint for T2E BEST-OF-ALL HINT, E2T ${e2tTradeType} due to T2E reserveIds and splits not empty`, async() => {
                    t2eHintType = BEST_OF_ALL;
                    t2eSplits = BPS_SPLIT;
                    e2tHintType = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];

                    hint = Helper.buildHintT2T(
                        'BEST_OF_ALL',
                        t2eHintType,
                        t2eReserves,
                        t2eSplits,
                        e2tTradeType,
                        e2tHintType,
                        e2tReserves,
                        e2tSplits,
                    );

                    await expectRevert(
                        hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                        'reserveIds and splits must be empty'
                    );
                });
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T BEST-OF-ALL HINT due to E2T reserveIds not empty`, async() => {
                    t2eHintType = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tHintType = BEST_OF_ALL;
                    e2tSplits = [];

                    hint = Helper.buildHintT2T(
                        t2eTradeType,
                        t2eHintType,
                        t2eReserves,
                        t2eSplits,
                        'BEST_OF_ALL',
                        e2tHintType,
                        e2tReserves,
                        e2tSplits,
                    );

                    await expectRevert(
                        hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                        'reserveIds and splits must be empty'
                    );
                });

                it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T BEST-OF-ALL HINT due to E2T splits not empty`, async() => {
                    t2eHintType = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tHintType = BEST_OF_ALL;
                    e2tSplits = BPS_SPLIT;

                    hint = Helper.buildHintT2T(
                        t2eTradeType,
                        t2eHintType,
                        t2eReserves,
                        t2eSplits,
                        'BEST_OF_ALL',
                        e2tHintType,
                        [],
                        e2tSplits,
                    );

                    await expectRevert(
                        hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                        'reserveIds and splits must be empty'
                    );
                });

                it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T BEST-OF-ALL HINT due to E2T reserveIds splits not empty`, async() => {
                    t2eHintType = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tHintType = BEST_OF_ALL;
                    e2tSplits = BPS_SPLIT;

                    hint = Helper.buildHintT2T(
                        t2eTradeType,
                        t2eHintType,
                        t2eReserves,
                        t2eSplits,
                        'BEST_OF_ALL',
                        e2tHintType,
                        e2tReserves,
                        e2tSplits,
                    );

                    await expectRevert(
                        hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                        'reserveIds and splits must be empty'
                    );
                });
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E RANDOM HEX for reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = Helper.buildHintT2T(
                            t2eTradeType,
                            t2eOpcode,
                            randomHex32(t2eReserves.length),
                            t2eSplits,
                            e2tTradeType,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );

                        try {
                            await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                        } catch(e) {
                            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                        }
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to E2T RANDOM HEX for reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = Helper.buildHintT2T(
                            t2eTradeType,
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tTradeType,
                            e2tOpcode,
                            randomHex32(t2eReserves.length),
                            e2tSplits,
                        );
                        
                        try {
                            await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                        } catch(e) {
                            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                        }
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E & E2T RANDOM HEX for reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = Helper.buildHintT2T(
                            t2eTradeType,
                            t2eOpcode,
                            randomHex32(t2eReserves.length),
                            t2eSplits,
                            e2tTradeType,
                            e2tOpcode,
                            randomHex32(t2eReserves.length),
                            e2tSplits,
                        );
                        
                        try {
                            await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                        } catch(e) {
                            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                        }
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to invalid T2E split values`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];

                        if (t2eTradeType == 'SPLIT') {
                            t2eSplits = [];
                            revertMsg = 'reserveIds.length != splits.length'
                        } else {
                            t2eSplits = BPS_SPLIT;
                            revertMsg = 'splits must be empty'
                        }

                        hint = Helper.buildHintT2T(
                            t2eTradeType,
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tTradeType,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );

                        await expectRevert(
                            hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                            revertMsg
                        );
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to invalid E2T split values`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = [];

                        if (e2tTradeType == 'SPLIT') {
                            e2tSplits = [];
                            revertMsg = 'reserveIds.length != splits.length'
                        } else {
                            e2tSplits = BPS_SPLIT;
                            revertMsg = 'splits must be empty'
                        }
                        
                        hint = Helper.buildHintT2T(
                            t2eTradeType,
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tTradeType,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );
                        
                        await expectRevert(
                            hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                            revertMsg
                        );
                    });

                    if (t2eTradeType !== 'MASK_OUT') {
                        it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to EMPTY T2E reserveIds`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            
                            hint = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eOpcode,
                                [],
                                t2eSplits,
                                e2tTradeType,
                                e2tOpcode,
                                e2tReserves,
                                e2tSplits,
                            );
                            
                            await expectRevert(
                                hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                                'reserveIds cannot be empty'
                            );
                        });

                        it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E TOKEN IS NOT LISTED for reserveId`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            
                            hint = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eOpcode,
                                t2eReserves,
                                t2eSplits,
                                e2tTradeType,
                                e2tOpcode,
                                e2tReserves,
                                e2tSplits,
                            );
        
                            await expectRevert(
                                hintHandler.parseTokenToTokenHint(t2eUnlistedToken, e2tToken, hint),
                                'token is not listed for reserveId'
                            );
                        });
                    }

                    if (e2tTradeType !== 'MASK_OUT') {
                        it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to EMPTY E2T reserveIds`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            
                            hint = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eOpcode,
                                t2eReserves,
                                t2eSplits,
                                e2tTradeType,
                                e2tOpcode,
                                [],
                                e2tSplits,
                            );
                            
                            await expectRevert(
                                hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                                'reserveIds cannot be empty'
                            );
                        });

                        it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to E2T TOKEN IS NOT LISTED for reserveId`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            
                            hint = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eOpcode,
                                t2eReserves,
                                t2eSplits,
                                e2tTradeType,
                                e2tOpcode,
                                e2tReserves,
                                e2tSplits,
                            );
        
                            await expectRevert(
                                hintHandler.parseTokenToTokenHint(t2eToken, e2tUnlistedToken, hint),
                                'token is not listed for reserveId'
                            );
                        });
                    }

                    if (t2eTradeType !== 'MASK_OUT' && e2tTradeType !== 'MASK_OUT') {
                        it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to EMPTY T2E & E2T reserveIds`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            
                            hint = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eOpcode,
                                [],
                                t2eSplits,
                                e2tTradeType,
                                e2tOpcode,
                                [],
                                e2tSplits,
                            );
                            
                            await expectRevert(
                                hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                                'reserveIds cannot be empty'
                            );
                        });

                        it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E & E2T TOKEN IS NOT LISTED for reserveId`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            
                            hint = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eOpcode,
                                t2eReserves,
                                t2eSplits,
                                e2tTradeType,
                                e2tOpcode,
                                e2tReserves,
                                e2tSplits,
                            );
        
                            await expectRevert(
                                hintHandler.parseTokenToTokenHint(t2eUnlistedToken, e2tUnlistedToken, hint),
                                'token is not listed for reserveId'
                            );
                        });
                    }

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E reserveId NOT FOUND`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = Helper.buildHintT2T(
                            t2eTradeType,
                            t2eOpcode,
                            t2eMissingReserves,
                            t2eSplits,
                            e2tTradeType,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );
                        
                        await expectRevert(
                            hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                            'reserveId not found'
                        );
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to E2T reserveId NOT FOUND`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = Helper.buildHintT2T(
                            t2eTradeType,
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tTradeType,
                            e2tOpcode,
                            e2tMissingReserves,
                            e2tSplits,
                        );
                        
                        await expectRevert(
                            hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                            'reserveId not found'
                        );
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E & E2T reserveId NOT FOUND`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = Helper.buildHintT2T(
                            t2eTradeType,
                            t2eOpcode,
                            t2eMissingReserves,
                            t2eSplits,
                            e2tTradeType,
                            e2tOpcode,
                            e2tMissingReserves,
                            e2tSplits,
                        );
                        
                        await expectRevert(
                            hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                            'reserveId not found'
                        );
                    });

                    if (t2eTradeType != 'SPLIT') {
                        it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to DUPLICATE T2E reserveIds`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            
                            hint = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eOpcode,
                                t2eDupReserves,
                                t2eSplits,
                                e2tTradeType,
                                e2tOpcode,
                                e2tReserves,
                                e2tSplits,
                            );
                            
                            await expectRevert(
                                hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                                'duplicate reserveId'
                            );
                        });
                    }

                    if (e2tTradeType != 'SPLIT') {
                        it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to DUPLICATE E2T reserveIds`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = [];
                            
                            hint = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eOpcode,
                                t2eReserves,
                                t2eSplits,
                                e2tTradeType,
                                e2tOpcode,
                                e2tDupReserves,
                                e2tSplits,
                            );
                            
                            await expectRevert(
                                hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                                'duplicate reserveId'
                            );
                        });
                    }

                    if (t2eTradeType != 'SPLIT' && e2tTradeType != 'SPLIT') {
                        it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to DUPLICATE T2E & E2T reserveIds`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = [];
                            
                            hint = Helper.buildHintT2T(
                                t2eTradeType,
                                t2eOpcode,
                                t2eDupReserves,
                                t2eSplits,
                                e2tTradeType,
                                e2tOpcode,
                                e2tDupReserves,
                                e2tSplits,
                            );
                            
                            await expectRevert(
                                hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                                'duplicate reserveId'
                            );
                        });
                    }
                });
            });

            Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                    it(`should revert for T2T hint for T2E SPLIT, E2T ${e2tTradeType} due to T2E Split ${invalidSplit}`, async() => {
                        t2eOpcode = SPLIT;
                        t2eSplits = INVALID_SPLIT_BPS[invalidSplit].value;
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                
                        hint = Helper.buildHintT2T(
                            'SPLIT',
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tTradeType,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );
                        
                        await expectRevert(
                            hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                            INVALID_SPLIT_BPS[invalidSplit].revertMsg
                        );
                    });
                });

                it(`should revert for T2T hint for T2E SPLIT, E2T ${e2tTradeType} due to RANDOM HEX for T2E splits`, async() => {
                    t2eOpcode = SPLIT;
                    t2eSplits = randomHex32(BPS_SPLIT.length);
                    e2tOpcode = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = Helper.buildHintT2T(
                        'SPLIT',
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                        e2tTradeType,
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );
    
                    try {
                        await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                    } catch(e) {
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T SPLIT due to E2T Split ${invalidSplit}`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = SPLIT;
                        e2tSplits = INVALID_SPLIT_BPS[invalidSplit].value;
                
                        hint = Helper.buildHintT2T(
                            t2eTradeType,
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            'SPLIT',
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );
                        
                        await expectRevert(
                            hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                            INVALID_SPLIT_BPS[invalidSplit].revertMsg
                        );
                    });
                });

                it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T SPLIT due to RANDOM HEX for E2T splits`, async() => {
                    t2eOpcode = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tOpcode = SPLIT;
                    e2tSplits = randomHex32(BPS_SPLIT.length);
                    
                    hint = Helper.buildHintT2T(
                        t2eTradeType,
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                        'SPLIT',
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );
    
                    try {
                        await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                    } catch(e) {
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                it(`should revert for T2T hint for T2E ${t2eTradeType}, RANDOM HEX HINT TYPE`, async() => {
                    t2eOpcode = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tOpcode = web3.utils.randomHex(32);
                    e2tSplits = [];
            
                    hint = Helper.buildHintT2T(
                        t2eTradeType,
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                        '',
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );

                    try {
                        await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                    } catch(e) {
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });

                it(`should revert for T2T hint for T2E ${t2eTradeType}, INVALID TYPE`, async() => {
                    t2eOpcode = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tOpcode = INVALID_HINT_TYPE;
                    e2tSplits = [];
            
                    hint = Helper.buildHintT2T(
                        t2eTradeType,
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                        '',
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );

                    try {
                        await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                    } catch(e) {
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });

                it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T SPLIT due to E2T reserveIds NOT IN INCREASING ORDER`, async() => {
                    t2eOpcode = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tOpcode = SPLIT;
                    e2tSplits = BPS_SPLIT;
                    
                    let hint;

                    hint = Helper.buildHintT2T(
                        t2eTradeType,
                        t2eOpcode,
                        t2eAscendingReserves,
                        t2eSplits,
                        '',
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );
   
                    await expectRevert(
                        hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                        'reserveIds not in increasing order'
                    );
                });
            });

            Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                it(`should revert for T2T hint for RANDOM HEX HINT TYPE, E2T ${e2tTradeType}`, async() => {
                    t2eOpcode = web3.utils.randomHex(32);
                    t2eSplits = [];
                    e2tOpcode = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
            
                    hint = Helper.buildHintT2T(
                        '',
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                        e2tTradeType,
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );

                    try {
                        await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                    } catch(e) {
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });

                it(`should revert for T2T hint for INVALID TYPE, E2T ${e2tTradeType}`, async() => {
                    t2eOpcode = INVALID_HINT_TYPE;
                    t2eSplits = [];
                    e2tOpcode = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
            
                    hint = Helper.buildHintT2T(
                        '',
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                        e2tTradeType,
                        e2tOpcode,
                        e2tReserves,
                        e2tSplits,
                    );
                    
                    try {
                        await hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint);
                    } catch(e) {
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });

                it(`should revert for T2T hint for T2E SPLIT, E2T ${e2tTradeType} due to T2E reserveIds NOT IN INCREASING ORDER`, async() => {
                    t2eOpcode = SPLIT;
                    t2eSplits = BPS_SPLIT;
                    e2tOpcode = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    let hint;

                    hint = Helper.buildHintT2T(
                        '',
                        t2eOpcode,
                        t2eReserves,
                        t2eSplits,
                        e2tTradeType,
                        e2tOpcode,
                        e2tAscendingReserves,
                        e2tSplits,
                    );

                    await expectRevert(
                        hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                        'reserveIds not in increasing order'
                    );
                });
            });

            it('should revert for T2T hint for T2E SPLIT, E2T SPLIT due to T2E & E2T reserveIds NOT IN INCREASING ORDER', async() => {
                t2eOpcode = SPLIT;
                t2eSplits = BPS_SPLIT;
                e2tOpcode = SPLIT;
                e2tSplits = BPS_SPLIT;
                
                let hint;

                hint = Helper.buildHintT2T(
                    '',
                    t2eOpcode,
                    t2eReserves,
                    t2eSplits,
                    '',
                    e2tOpcode,
                    e2tReserves,
                    e2tSplits,
                );

                await expectRevert(
                    hintHandler.parseTokenToTokenHint(t2eToken, e2tToken, hint),
                    'reserveIds not in increasing order'
                );
            });
        });
    });

    describe("test throw hint error", function() {
        it("should do nothing if no error is passed into throwHintError", async() => {
            await hintHandler.callHintError(0);
        });
    });
});

function parseHint(hint) {
    let addresses = [];
    const params = web3.eth.abi.decodeParameters(
        ['uint8', 'bytes32[]', 'uint[]'],
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

function unpackT2T(hint) {
    const hints = web3.eth.abi.decodeParameters(
        ['bytes', 'bytes'],
        hint,
    );
  
    return { 
        t2eHint: hints['0'],
        e2tHint: hints['1'],
    };
}
  
function randomHex32(size) {
    let arr = [];
  
    for (let i = 0; i < size; i++) {
        arr.push(web3.utils.randomHex(32));
    }
  
    return arr;
}
  