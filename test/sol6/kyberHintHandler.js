const MockHintHandler = artifacts.require('MockHintHandler.sol');
const Helper = require("../helper.js");
const { expectRevert } = require('@openzeppelin/test-helpers');

const INVALID_HINT_TYPE = '0x09';
const MASK_IN = 0;
const MASK_OUT = 1;
const SPLIT = 2;
const BPS_SPLIT = ['2000', '1500', '1000', '5000', '500'];

const T2E_ORDERED = ['0xaa00000031e04c7f', '0xaa12345616709a5d', '0xaa12aa56bbfff000', '0xcc12345675fff057', '0xff1234567a334f7d' ];
const T2E_UNORDERED = ['0xff1234567a334f7d', '0xaa12aa56bbfff000', '0xcc12345675fff057', '0xaa7777cc1234500f', '0xaa00000031e04c7f' ];
const T2E_DUPLICATES = ['0xff1234567a334f7d', '0xaa12aa56bbfff000', '0xcc12345675fff057', '0xff1234567a334f7d', '0xaa00000031e04c7f' ];
const T2E_MISSING = ['0xff1234567a334f7d', '0xcc12345675fff057', '0xaa00000031e04c7f', '0xaa7777cc1234500f', '0xbb12aa56bbfff000' ]; // 0xbb12aa56bbfff000 doesn't exist
const E2T_ORDERED = ['0xaa00000031e04c7f', '0xaa12345616709a5d', '0xaa12aa56bbfff000', '0xcc12345675fff057', '0xff12345663820d8f' ];
const E2T_UNORDERED = ['0xaa00000031e04c7f', '0xff12345663820d8f', '0xaa12345616709a5d', '0xaa12aa56bbfff000', '0xcc12345675fff057' ];
const E2T_DUPLICATES = ['0xaa00000031e04c7f', '0xaa12aa56bbfff000', '0xcc12345675fff057', '0xff1234567a334f7d', '0xcc12345675fff057' ];
const E2T_MISSING = ['0xff12345663820d8f', '0xaa00000031e04c7f', '0xbb12345616709a5d', '0xaa12aa56bbfff000', '0xcc12345675fff057' ]; // 0xbb12345616709a5d doesn't exist

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
let hint;
let hints;
let revertMsg;

contract('KyberHintHandler', function(accounts) {
    before('one time init, admin account, and setup hint parser', async() => {
        admin = accounts[0];
        hintHandler = await MockHintHandler.new();

        const idToAddress = Object.keys(ID_TO_ADDRESS);

        for (var i = 0; i < idToAddress.length; i++) {
            await hintHandler.addReserve(ID_TO_ADDRESS[idToAddress[i]], idToAddress[i]);
        }
    });

    describe("test building various hints", function() {
        describe("Token to ETH (T2E)", function() {
            before('one time init of vars', async() => {
                t2eReserves = T2E_UNORDERED;
                t2eDupReserves = T2E_DUPLICATES;
                t2eMissingReserves = T2E_MISSING;
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should build the T2E hint for ${tradeType}`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = await hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);
                    expected = buildHint(tradeType)(t2eOpcode, t2eReserves, t2eSplits);
            
                    Helper.assertEqual(hint, expected);
                });
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert the T2E hint for ${tradeType} due to EMPTY reserveIds`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    await expectRevert(
                        hintHandler.buildTokenToEthHint(t2eOpcode, [], t2eSplits),
                        'reserveIds cannot be empty'
                    );
                });
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert the T2E hint for ${tradeType} due to reserveId NOT FOUND`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    await expectRevert(
                        hintHandler.buildTokenToEthHint(t2eOpcode, t2eMissingReserves, t2eSplits),
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
                        hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits),
                        revertMsg
                    );
                });
            });

            Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                it(`should revert the T2E hint for SPLIT due to ${invalidSplit}`, async() => {
                    t2eOpcode = SPLIT;
                    t2eSplits = INVALID_SPLIT_BPS[invalidSplit].value;
            
                    await expectRevert(
                        hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits),
                        INVALID_SPLIT_BPS[invalidSplit].revertMsg
                    );
                });
            });

            it('should revert the T2E hint for SPLIT due to DUPLICATE reserveIds', async() => {
                t2eOpcode = SPLIT;
                t2eSplits = BPS_SPLIT
                
                await expectRevert(
                    hintHandler.buildTokenToEthHint(t2eOpcode, t2eDupReserves, t2eSplits),
                    'duplicate reserveId'
                );
            });

            it('should revert the T2E hint for invalid hint type', async() => {
                t2eOpcode = INVALID_HINT_TYPE;
                t2eSplits = [];

                try {
                    await hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("ETH to Token (E2T)", function() {
            before('one time init of vars', async() => {
                e2tReserves = E2T_UNORDERED;
                e2tDupReserves = E2T_DUPLICATES;
                e2tMissingReserves = E2T_MISSING;
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should build the E2T hint for ${tradeType}`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = await hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);
                    expected = buildHint(tradeType)(e2tOpcode, e2tReserves, e2tSplits);
            
                    Helper.assertEqual(hint, expected);
                });
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert the E2T hint for ${tradeType} due to EMPTY reserveIds`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    await expectRevert(
                        hintHandler.buildEthToTokenHint(e2tOpcode, [], e2tSplits),
                        'reserveIds cannot be empty'
                    );
                });
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert the E2T hint for ${tradeType} due to reserveId NOT FOUND`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    await expectRevert(
                        hintHandler.buildEthToTokenHint(e2tOpcode, e2tMissingReserves, e2tSplits),
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
                        hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits),
                        revertMsg
                    );
                });
            });
            
            Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                it(`should revert the E2T hint for SPLIT due to ${invalidSplit}`, async() => {
                    e2tOpcode = SPLIT;
                    e2tSplits = INVALID_SPLIT_BPS[invalidSplit].value;
            
                    await expectRevert(
                        hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits),
                        INVALID_SPLIT_BPS[invalidSplit].revertMsg
                    );
                });
            });

            it('should revert the E2T hint for SPLIT due to DUPLICATE reserveIds', async() => {
                e2tOpcode = SPLIT;
                e2tSplits = BPS_SPLIT;

                await expectRevert(
                    hintHandler.buildEthToTokenHint(e2tOpcode, e2tDupReserves, e2tSplits),
                    'duplicate reserveId'
                );
            });

            it('should revert the E2T hint for invalid hint type', async() => {
                e2tOpcode = INVALID_HINT_TYPE;
                e2tSplits = [];

                try {
                    await hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("Token to Token (T2T)", function() {
            before('one time init of vars', async() => {
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
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );
                        expected = buildHintT2T(
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
                                t2eOpcode, t2eReserves, t2eSplits,
                                e2tOpcode, e2tReserves, e2tSplits
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
                                t2eOpcode, t2eReserves, t2eSplits,
                                e2tOpcode, e2tReserves, e2tSplits
                            ),
                            revertMsg
                        );
                    });

                    it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to EMPTY T2E reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eOpcode, [], t2eSplits,
                                e2tOpcode, e2tReserves, e2tSplits,
                            ),
                            'reserveIds cannot be empty'
                        );
                    });

                    it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to EMPTY E2T reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eOpcode, t2eReserves, t2eSplits,
                                e2tOpcode, [], e2tSplits,
                            ),
                            'reserveIds cannot be empty'
                        );
                    });

                    it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E & E2T EMPTY reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eOpcode, [], t2eSplits,
                                e2tOpcode, [], e2tSplits,
                            ),
                            'reserveIds cannot be empty'
                        );
                    });

                    it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E reserveId NOT FOUND`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eOpcode, t2eMissingReserves, t2eSplits,
                                e2tOpcode, e2tReserves, e2tSplits,
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
                                t2eOpcode, t2eReserves, t2eSplits,
                                e2tOpcode, e2tMissingReserves, e2tSplits,
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
                                t2eOpcode, t2eMissingReserves, t2eSplits,
                                e2tOpcode, e2tMissingReserves, e2tSplits,
                            ),
                            'reserveId not found'
                        );
                    });
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
                                t2eOpcode, t2eReserves, t2eSplits,
                                e2tOpcode, e2tReserves, e2tSplits
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
                            t2eOpcode, t2eReserves, t2eSplits,
                            e2tOpcode, e2tDupReserves, e2tSplits,
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
                            t2eOpcode, t2eReserves, t2eSplits,
                            e2tOpcode, e2tReserves, e2tSplits
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
                                t2eOpcode, t2eReserves, t2eSplits,
                                e2tOpcode, e2tReserves, e2tSplits
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
                            t2eOpcode, t2eDupReserves, t2eSplits,
                            e2tOpcode, e2tReserves, e2tSplits,
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
                                t2eOpcode, t2eReserves, t2eSplits,
                                e2tOpcode, e2tReserves, e2tSplits
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
                t2eReserves = T2E_UNORDERED;
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should parse the T2E hint for ${tradeType}`, async() => {
                    t2eHintType = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];

                    hint = buildHint(tradeType)(t2eHintType, t2eReserves, t2eSplits);
            
                    actual = await hintHandler.parseTokenToEthHint(hint);
                    expected = parseHint(hint);
    
                    Helper.assertEqual(actual.tokenToEthType, expected.tradeType);
                    assert.deepEqual(actual.tokenToEthReserveIds, expected.reserveIds);
                    assert.deepEqual(actual.tokenToEthAddresses, expected.addresses);
                    Helper.assertEqual(actual.tokenToEthSplits, expected.splits);
                });
            });
        });

        describe("ETH to Token (E2T)", function() {
            before('one time init of vars', async() => {
                e2tReserves = E2T_UNORDERED;
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should parse the E2T hint for ${tradeType}`, async() => {
                    e2tHintType = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];

                    hint = buildHint(tradeType)(e2tHintType, e2tReserves, e2tSplits);
            
                    actual = await hintHandler.parseEthToTokenHint(hint);
                    expected = parseHint(hint);
    
                    Helper.assertEqual(actual.ethToTokenType, expected.tradeType);
                    assert.deepEqual(actual.ethToTokenReserveIds, expected.reserveIds);
                    assert.deepEqual(actual.ethToTokenAddresses, expected.addresses);
                    Helper.assertEqual(actual.ethToTokenSplits, expected.splits);
                });
            });
        });

        describe("Token to Token (T2T)", function() {
            before('one time init of vars', async() => {
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

                        hint = buildHintT2T(
                            t2eTradeType,
                            t2eHintType,
                            t2eReserves,
                            t2eSplits,
                            e2tTradeType,
                            e2tHintType,
                            e2tReserves,
                            e2tSplits,
                        );
                
                        actual = await hintHandler.parseTokenToTokenHint(hint);
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
    });

    describe("test parsing various incorrect hints", function() {
        describe("Token to ETH (T2E)", function() {
            before('one time init of vars', async() => {
                t2eReserves = T2E_UNORDERED;
                t2eDupReserves = T2E_DUPLICATES;
                t2eMissingReserves = T2E_MISSING;
            });
            
            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert for T2E hint for ${tradeType} due to RANDOM HEX for reservesIds`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = buildHint(tradeType)(t2eOpcode, randomHex32(t2eReserves.length), t2eSplits);

                    try {
                        await hintHandler.parseTokenToEthHint(hint);
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
                    
                    hint = buildHint(tradeType)(t2eOpcode, t2eReserves, t2eSplits);            

                    await expectRevert(
                        hintHandler.parseTokenToEthHint(hint),
                        revertMsg
                    );
                });

                it(`should revert for T2E hint for ${tradeType} due to EMPTY reserveIds`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = buildHint(tradeType)(t2eOpcode, [], t2eSplits);

                    await expectRevert(
                        hintHandler.parseTokenToEthHint(hint),
                        'reserveIds cannot be empty'
                    );
                });

                it(`should revert for T2E hint for ${tradeType} due to reserveId NOT FOUND`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = buildHint(tradeType)(t2eOpcode, t2eMissingReserves, t2eSplits);

                    await expectRevert(
                        hintHandler.parseTokenToEthHint(hint),
                        'reserveId not found'
                    );
                });

                it(`should revert for T2E hint for ${tradeType} due to DUPLICATE reserveIds`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];
                    t2eSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
    
                    hint = buildHint(tradeType)(t2eOpcode, t2eDupReserves, t2eSplits);
                    
                    await expectRevert(
                        hintHandler.parseTokenToEthHint(hint),
                        'duplicate reserveId'
                    );
                });
            });

            it('should revert for T2E hint for SPLIT due to reserveIds NOT IN INCREASING ORDER', async() => {
                t2eOpcode = SPLIT;
                t2eSplits = BPS_SPLIT;

                hint = buildHint()(t2eOpcode, t2eReserves, t2eSplits);

                await expectRevert(
                    hintHandler.parseTokenToEthHint(hint),
                    'reserveIds not in increasing order'
                );
            });

            Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                it(`should revert for T2E hint for SPLIT due to ${invalidSplit}`, async() => {
                    t2eOpcode = SPLIT;
                    t2eSplits = INVALID_SPLIT_BPS[invalidSplit].value;
            
                    hint = buildHint('SPLIT')(t2eOpcode, t2eReserves, t2eSplits);            
                    
                    await expectRevert(
                        hintHandler.parseTokenToEthHint(hint),
                        INVALID_SPLIT_BPS[invalidSplit].revertMsg
                    );
                });
            });

            it('should revert for T2E hint for SPLIT due to RANDOM HEX for splits', async() => {
                t2eOpcode = SPLIT;
                t2eSplits = randomHex32(BPS_SPLIT.length);
                
                hint = buildHint('SPLIT')(t2eOpcode, t2eReserves, t2eSplits);

                try {
                    await hintHandler.parseTokenToEthHint(hint);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });

            it('should revert the T2E hint for RANDOM HEX HINT TYPE', async() => {
                t2eOpcode = web3.utils.randomHex(32);
                t2eSplits = [];

                hint = buildHint()(t2eOpcode, t2eReserves, t2eSplits);
                
                try {
                    await hintHandler.parseTokenToEthHint(hint);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });

            it('should revert the T2E hint for invalid hint type', async() => {
                t2eOpcode = INVALID_HINT_TYPE;
                t2eSplits = [];

                hint = buildHint()(t2eOpcode, t2eReserves, t2eSplits);
                
                try {
                    await hintHandler.parseTokenToEthHint(hint);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("ETH to Token (E2T)", function() {
            before('one time init of vars', async() => {
                e2tReserves = E2T_UNORDERED;
                e2tDupReserves = E2T_DUPLICATES;
                e2tMissingReserves = E2T_MISSING;
            });
            
            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert for E2T hint for ${tradeType} due to RANDOM HEX for reservesIds`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = buildHint(tradeType)(e2tOpcode, randomHex32(t2eReserves.length), e2tSplits);

                    try {
                        await hintHandler.parseEthToTokenHint(hint);
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
                    
                    hint = buildHint(tradeType)(e2tOpcode, e2tReserves, e2tSplits);
                    
                    await expectRevert(
                        hintHandler.parseEthToTokenHint(hint),
                        revertMsg
                    );
                });

                it(`should revert for E2T hint for ${tradeType} due to EMPTY reserveIds`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? [] : BPS_SPLIT;
                    
                    hint = buildHint(tradeType)(e2tOpcode, [], e2tSplits);
                    
                    await expectRevert(
                        hintHandler.parseEthToTokenHint(hint),
                        'reserveIds cannot be empty'
                    );
                });

                it(`should revert for E2T hint for ${tradeType} due to reserveId NOT FOUND`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = buildHint(tradeType)(e2tOpcode, e2tMissingReserves, e2tSplits);
                    
                    await expectRevert(
                        hintHandler.parseEthToTokenHint(hint),
                        'reserveId not found'
                    );
                });
                
                it(`should revert for E2T hint for ${tradeType} due to DUPLICATE reserveIds`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];
                    e2tSplits = (tradeType == 'SPLIT') ? BPS_SPLIT : [];
    
                    hint = buildHint(tradeType)(e2tOpcode, e2tDupReserves, e2tSplits);
                    
                    await expectRevert(
                        hintHandler.parseEthToTokenHint(hint),
                        'duplicate reserveId'
                    );
                });
            });

            it('should revert for E2T hint for SPLIT due to reserveIds NOT IN INCREASING ORDER', async() => {
                e2tOpcode = SPLIT;
                e2tSplits = BPS_SPLIT;

                hint = buildHint()(e2tOpcode, e2tReserves, e2tSplits);

                await expectRevert(
                    hintHandler.parseEthToTokenHint(hint),
                    'reserveIds not in increasing order'
                );
            });

            Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                it(`should revert for E2T hint for SPLIT due to ${invalidSplit}`, async() => {
                    e2tOpcode = SPLIT;
                    e2tSplits = INVALID_SPLIT_BPS[invalidSplit].value;
            
                    hint = buildHint('SPLIT')(e2tOpcode, e2tReserves, e2tSplits);
                    
                    await expectRevert(
                        hintHandler.parseEthToTokenHint(hint),
                        INVALID_SPLIT_BPS[invalidSplit].revertMsg
                    );
                });
            });

            it('should revert for E2T hint for SPLIT due to RANDOM HEX for splits', async() => {
                e2tOpcode = SPLIT;
                e2tSplits = randomHex32(BPS_SPLIT.length);
                
                hint = buildHint('SPLIT')(e2tOpcode, e2tReserves, e2tSplits);

                try {
                    await hintHandler.parseEthToTokenHint(hint);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });

            it('should revert the E2T hint for RANDOM HEX HINT TYPE', async() => {
                e2tOpcode = web3.utils.randomHex(32);
                e2tSplits = [];

                hint = buildHint()(e2tOpcode, e2tReserves, e2tSplits);
                
                try {
                    await hintHandler.parseEthToTokenHint(hint);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });

            it('should revert the E2T hint for invalid hint type', async() => {
                e2tOpcode = INVALID_HINT_TYPE;
                e2tSplits = [];

                hint = buildHint()(e2tOpcode, e2tReserves, e2tSplits);
                
                try {
                    await hintHandler.parseEthToTokenHint(hint);
                } catch(e) {
                    assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                }
            });
        });

        describe("Token to Token (T2T)", function() {
            before('one time init of vars', async() => {
                t2eReserves = T2E_UNORDERED;
                e2tReserves = E2T_UNORDERED;
                t2eDupReserves = T2E_DUPLICATES;
                e2tDupReserves = E2T_DUPLICATES;
                t2eMissingReserves = T2E_MISSING;
                e2tMissingReserves = E2T_MISSING;
                t2eAscendingReserves = T2E_ORDERED;
                e2tAscendingReserves = E2T_ORDERED;
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E RANDOM HEX for reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = buildHintT2T(
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
                            await hintHandler.parseTokenToTokenHint(hint);
                        } catch(e) {
                            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                        }
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to E2T RANDOM HEX for reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = buildHintT2T(
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
                            await hintHandler.parseTokenToTokenHint(hint);
                        } catch(e) {
                            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                        }
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E & E2T RANDOM HEX for reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = buildHintT2T(
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
                            await hintHandler.parseTokenToTokenHint(hint);
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

                        hint = buildHintT2T(
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
                            hintHandler.parseTokenToTokenHint(hint),
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
                        
                        hint = buildHintT2T(
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
                            hintHandler.parseTokenToTokenHint(hint),
                            revertMsg
                        );
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to EMPTY T2E reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = buildHintT2T(
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
                            hintHandler.parseTokenToTokenHint(hint),
                            'reserveIds cannot be empty'
                        );
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to EMPTY E2T reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = buildHintT2T(
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
                            hintHandler.parseTokenToTokenHint(hint),
                            'reserveIds cannot be empty'
                        );
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to EMPTY T2E & E2T reserveIds`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = buildHintT2T(
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
                            hintHandler.parseTokenToTokenHint(hint),
                            'reserveIds cannot be empty'
                        );
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E reserveId NOT FOUND`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = buildHintT2T(
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
                            hintHandler.parseTokenToTokenHint(hint),
                            'reserveId not found'
                        );
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to E2T reserveId NOT FOUND`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = buildHintT2T(
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
                            hintHandler.parseTokenToTokenHint(hint),
                            'reserveId not found'
                        );
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E & E2T reserveId NOT FOUND`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        
                        hint = buildHintT2T(
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
                            hintHandler.parseTokenToTokenHint(hint),
                            'reserveId not found'
                        );
                    });

                    if (t2eTradeType != 'SPLIT') {
                        it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to DUPLICATE T2E reserveIds`, async() => {
                            t2eOpcode = TRADE_TYPES[t2eTradeType];
                            t2eSplits = [];
                            e2tOpcode = TRADE_TYPES[e2tTradeType];
                            e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                            
                            hint = buildHintT2T(
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
                                hintHandler.parseTokenToTokenHint(hint),
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
                            
                            hint = buildHintT2T(
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
                                hintHandler.parseTokenToTokenHint(hint),
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
                            
                            hint = buildHintT2T(
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
                                hintHandler.parseTokenToTokenHint(hint),
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
                
                        hint = buildHintT2T(
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
                            hintHandler.parseTokenToTokenHint(hint),
                            INVALID_SPLIT_BPS[invalidSplit].revertMsg
                        );
                    });
                });

                it(`should revert for T2T hint for T2E SPLIT, E2T ${e2tTradeType} due to RANDOM HEX for T2E splits`, async() => {
                    t2eOpcode = SPLIT;
                    t2eSplits = randomHex32(BPS_SPLIT.length);
                    e2tOpcode = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    
                    hint = buildHintT2T(
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
                        await hintHandler.parseTokenToTokenHint(hint);
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
                
                        hint = buildHintT2T(
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
                            hintHandler.parseTokenToTokenHint(hint),
                            INVALID_SPLIT_BPS[invalidSplit].revertMsg
                        );
                    });
                });

                it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T SPLIT due to RANDOM HEX for E2T splits`, async() => {
                    t2eOpcode = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tOpcode = SPLIT;
                    e2tSplits = randomHex32(BPS_SPLIT.length);
                    
                    hint = buildHintT2T(
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
                        await hintHandler.parseTokenToTokenHint(hint);
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
            
                    hint = buildHintT2T(
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
                        await hintHandler.parseTokenToTokenHint(hint);
                    } catch(e) {
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });

                it(`should revert for T2T hint for T2E ${t2eTradeType}, INVALID TYPE`, async() => {
                    t2eOpcode = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                    e2tOpcode = INVALID_HINT_TYPE;
                    e2tSplits = [];
            
                    hint = buildHintT2T(
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
                        await hintHandler.parseTokenToTokenHint(hint);
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

                    hint = buildHintT2T(
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
                        hintHandler.parseTokenToTokenHint(hint),
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
            
                    hint = buildHintT2T(
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
                        await hintHandler.parseTokenToTokenHint(hint);
                    } catch(e) {
                        assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
                    }
                });

                it(`should revert for T2T hint for INVALID TYPE, E2T ${e2tTradeType}`, async() => {
                    t2eOpcode = INVALID_HINT_TYPE;
                    t2eSplits = [];
                    e2tOpcode = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
            
                    hint = buildHintT2T(
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
                        await hintHandler.parseTokenToTokenHint(hint);
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

                    hint = buildHintT2T(
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
                        hintHandler.parseTokenToTokenHint(hint),
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

                hint = buildHintT2T(
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
                    hintHandler.parseTokenToTokenHint(hint),
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

function buildHint(tradeType) {
    if (tradeType == 'SPLIT') {
        return (tradeType, reserveIds, splits) => {
            let sortedReserveIds = [];
            let sortedSplits = [];
        
            reserveIds.map(function (v, i) {
                return {
                    id: v,
                    split: splits[i],
                };
            }).sort(function (a, b) {
                return ((a.id < b.id) ? -1 : ((a.id === b.id) ? 0 : 1));
            }).forEach(function (v, i) {
                sortedReserveIds[i] = v.id;
                if (v.split) sortedSplits[i] = v.split;
            });
        
            return web3.eth.abi.encodeParameters(
                ['uint8', 'bytes32[]', 'uint[]'],
                [tradeType, sortedReserveIds, sortedSplits],
            );
        }
    } else {
        return (tradeType, reserveIds, splits) => {
            return web3.eth.abi.encodeParameters(
                ['uint8', 'bytes32[]', 'uint[]'],
                [tradeType, reserveIds, splits],
            );
        }
    }
}

function buildHintT2T(
    t2eType,
    t2eOpcode,
    t2eReserveIds,
    t2eSplits,
    e2tType,
    e2tOpcode,
    e2tReserveIds,
    e2tSplits
) {
    const t2eHint = buildHint(t2eType)(t2eOpcode, t2eReserveIds, t2eSplits);
    const e2tHint = buildHint(e2tType)(e2tOpcode, e2tReserveIds, e2tSplits);

    return web3.eth.abi.encodeParameters(
        ['bytes', 'bytes'],
        [t2eHint, e2tHint],
    );
}

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
