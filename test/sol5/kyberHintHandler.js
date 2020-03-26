const MockHintHandler = artifacts.require('MockHintHandler.sol');
const Helper = require("../helper.js");
const { expectRevert } = require('@openzeppelin/test-helpers');

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
    MORE_THAN_10000BPS: {value: ['5000', '6000'], revertMsg: 'total BPS != 10000'}, // more than 10000bps
    LESS_THAN_10000BPS: {value: ['3000', '4000'], revertMsg: 'total BPS != 10000'},// less than 10000bos
    EMPTY_SPLITS: {value: [], revertMsg: 'reserveIds.length != splits.length'}
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
let revertMsg;

contract('KyberHintHandler', function(accounts) {
    before('one time init, admin account and setup hint parser', async() => {
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
                    
                    await expectRevert(
                        hintHandler.buildTokenToEthHint(t2eOpcode, [], t2eSplits),
                        'reserveIds cannot be empty'
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
                it(`should revert the T2E hint for SPLITS due to ${invalidSplit}`, async() => {
                    t2eOpcode = SPLIT;
                    t2eSplits = INVALID_SPLIT_BPS[invalidSplit].value;
            
                    await expectRevert(
                        hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits),
                        INVALID_SPLIT_BPS[invalidSplit].revertMsg
                    );
                });
            });

            it('should revert the T2E hint for SPLITS due to duplicate reserve ID', async() => {
                t2eOpcode = SPLIT;
                let t2eDupReserves = ['0xff1234567a334f7d', '0xff1234567a334f7d'];
                await expectRevert(
                    hintHandler.buildTokenToEthHint(t2eOpcode, t2eDupReserves, BPS_SPLIT),
                    'duplicate reserveId'
                );
            });

            it('should revert the T2E hint for invalid hint type', async() => {
                t2eOpcode = INVALID_HINT_TYPE;
                t2eSplits = [];

                await expectRevert.unspecified(
                    hintHandler.buildTokenToEthHint(t2eOpcode, t2eReserves, t2eSplits)                        
                );
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
                    
                    await expectRevert(
                        hintHandler.buildEthToTokenHint(e2tOpcode, [], e2tSplits),
                        'reserveIds cannot be empty'
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
                it(`should revert the E2T hint for SPLITS due to ${invalidSplit}`, async() => {
                    e2tOpcode = SPLIT;
                    e2tSplits = INVALID_SPLIT_BPS[invalidSplit].value;
            
                    await expectRevert(
                        hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits),
                        INVALID_SPLIT_BPS[invalidSplit].revertMsg
                    );
                });
            });

            it('should revert the E2T hint for SPLITS due to duplicate reserve ID', async() => {
                e2tOpcode = SPLIT;
                let e2tDupReserves = ['0xff1234567a334f7d', '0xff1234567a334f7d'];
                await expectRevert(
                    hintHandler.buildEthToTokenHint(e2tOpcode, e2tDupReserves, BPS_SPLIT),
                    'duplicate reserveId'
                );
            });

            it('should revert the E2T hint for invalid hint type', async() => {
                e2tOpcode = INVALID_HINT_TYPE;
                e2tSplits = [];

                await expectRevert.unspecified(
                    hintHandler.buildEthToTokenHint(e2tOpcode, e2tReserves, e2tSplits)
                );
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

                    it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to empty T2E reserveIds`, async() => {
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
                        
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eOpcode, [], t2eSplits,
                                e2tOpcode, e2tReserves, e2tSplits,
                            ),
                            'reserveIds cannot be empty'
                        );
                    });

                    it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to empty E2T reserveIds`, async() => {
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
                        
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eOpcode, t2eReserves, t2eSplits,
                                e2tOpcode, [], e2tSplits,
                            ),
                            'reserveIds cannot be empty'
                        );
                    });

                    it(`should revert the T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to T2E & E2T empty reserveIds`, async() => {
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
                        
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eOpcode, [], t2eSplits,
                                e2tOpcode, [], e2tSplits,
                            ),
                            'reserveIds cannot be empty'
                        );
                    });
                });
            });

            Object.keys(TRADE_TYPES).forEach(tradeType => {
                Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                    it(`should revert the T2T hint for SPLITS, ${tradeType} due to T2E ${invalidSplit}`, async() => {
                        t2eOpcode = SPLIT;
                        t2eSplits = INVALID_SPLIT_BPS[invalidSplit].value;
                        e2tOpcode = TRADE_TYPES[tradeType];

                        if (tradeType == 'SPLIT') {
                            e2tSplits = BPS_SPLIT;
                        } else {
                            e2tSplits = [];
                        }
                
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eOpcode, t2eReserves, t2eSplits,
                                e2tOpcode, e2tReserves, e2tSplits
                            ),
                            INVALID_SPLIT_BPS[invalidSplit].revertMsg
                        );
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
            
                    await expectRevert.unspecified(
                        hintHandler.buildTokenToTokenHint(
                            t2eOpcode, t2eReserves, t2eSplits,
                            e2tOpcode, e2tReserves, e2tSplits
                        )
                    );
                });

                Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                    it(`should revert the T2T hint for ${tradeType}, SPLITS due to E2T ${invalidSplit}`, async() => {
                        t2eOpcode = TRADE_TYPES[tradeType];
                        e2tOpcode = SPLIT;
                        e2tSplits = INVALID_SPLIT_BPS[invalidSplit].value;

                        if (tradeType == 'SPLIT') {
                            t2eSplits = BPS_SPLIT;
                        } else {
                            t2eSplits = [];
                        }
                
                        await expectRevert(
                            hintHandler.buildTokenToTokenHint(
                                t2eOpcode, t2eReserves, t2eSplits,
                                e2tOpcode, e2tReserves, e2tSplits
                            ),
                            INVALID_SPLIT_BPS[invalidSplit].revertMsg
                        );
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
            
                    await expectRevert.unspecified(
                        hintHandler.buildTokenToTokenHint(
                            t2eOpcode, t2eReserves, t2eSplits,
                            e2tOpcode, e2tReserves, e2tSplits
                        )
                    );
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
                it(`should revert for T2E hint for ${tradeType} due to invalid split value`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        t2eSplits = [];
                        revertMsg = 'reserveIds.length != splits.length';
                    } else {
                        t2eSplits = BPS_SPLIT;
                        revertMsg = 'splits must be empty';
                    }
                    
                    const hint = buildHint(t2eOpcode, t2eReserves, t2eSplits);            

                    await expectRevert(
                        hintHandler.parseTokenToEthHint(hint),
                        revertMsg
                    );
                });

                it(`should revert for T2E hint for ${tradeType} due to empty reserveIds`, async() => {
                    t2eOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        t2eSplits = BPS_SPLIT;
                    } else {
                        t2eSplits = [];
                    }
                    
                    const hint = buildHint(t2eOpcode, [], t2eSplits);

                    await expectRevert(
                        hintHandler.parseTokenToEthHint(hint),
                        'reserveIds cannot be empty'
                    );
                });
            });

            Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                it(`should revert for T2E hint for SPLITS due to ${invalidSplit}`, async() => {
                    t2eOpcode = SPLIT;
                    t2eSplits = INVALID_SPLIT_BPS[invalidSplit].value;
            
                    const hint = buildHint(t2eOpcode, t2eReserves, t2eSplits);            
                    
                    await expectRevert(
                        hintHandler.parseTokenToEthHint(hint),
                        INVALID_SPLIT_BPS[invalidSplit].revertMsg
                    );
                });
            });

            it('should revert the T2E hint for invalid hint type', async() => {
                t2eOpcode = INVALID_HINT_TYPE;
                t2eSplits = [];

                const hint = buildHint(t2eOpcode, t2eReserves, t2eSplits);
                
                await expectRevert.unspecified(
                    hintHandler.parseTokenToEthHint(hint)
                );
            });
        });

        describe("ETH to Token (E2T)", function() {
            before('one time init of vars', async() => {
                e2tReserves = ['0xff1234567a334f7d', '0xcc12345675fff057'];
            });
            
            Object.keys(TRADE_TYPES).forEach(tradeType => {
                it(`should revert for E2T hint for ${tradeType} due to invalid split value`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        e2tSplits = [];
                        revertMsg = 'reserveIds.length != splits.length';
                    } else {
                        e2tSplits = BPS_SPLIT;
                        revertMsg = 'splits must be empty';
                    }
                    
                    const hint = buildHint(e2tOpcode, e2tReserves, e2tSplits);
                    
                    await expectRevert(
                        hintHandler.parseEthToTokenHint(hint),
                        revertMsg
                    );
                });

                it(`should revert for E2T hint for ${tradeType} due to empty reserveIds`, async() => {
                    e2tOpcode = TRADE_TYPES[tradeType];

                    if (tradeType == 'SPLIT') {
                        e2tSplits = BPS_SPLIT;
                    } else {
                        e2tSplits = [];
                    }
                    
                    const hint = buildHint(e2tOpcode, [], e2tSplits);
                    
                    await expectRevert(
                        hintHandler.parseEthToTokenHint(hint),
                        'reserveIds cannot be empty'
                    );
                });
            });

            Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                it(`should revert for E2T hint for SPLITS due to ${invalidSplit}`, async() => {
                    e2tOpcode = SPLIT;
                    e2tSplits = INVALID_SPLIT_BPS[invalidSplit].value;
            
                    const hint = buildHint(e2tOpcode, e2tReserves, e2tSplits);
                    
                    await expectRevert(
                        hintHandler.parseEthToTokenHint(hint),
                        INVALID_SPLIT_BPS[invalidSplit].revertMsg
                    );
                });
            });

            it('should revert the E2T hint for invalid hint type', async() => {
                e2tOpcode = INVALID_HINT_TYPE;
                e2tSplits = [];

                const hint = buildHint(e2tOpcode, e2tReserves, e2tSplits);
                
                await expectRevert.unspecified(
                    hintHandler.parseEthToTokenHint(hint)
                );
            });
        });

        describe("Token to Token (T2T)", function() {
            before('one time init of vars', async() => {
                t2eReserves = ['0xff1234567a334f7d', '0xcc12345675fff057'];
                e2tReserves = ['0xff12345663820d8f', '0xaa12345616709a5d'];
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
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

                        const hint = buildHintT2T(
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
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
                        
                        const hint = buildHintT2T(
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
                            e2tOpcode,
                            e2tReserves,
                            e2tSplits,
                        );
                        
                        await expectRevert(
                            hintHandler.parseTokenToTokenHint(hint),
                            revertMsg
                        );
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to empty T2E reserveIds`, async() => {
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
                            e2tReserves,
                            e2tSplits,
                        );
                        
                        await expectRevert(
                            hintHandler.parseTokenToTokenHint(hint),
                            'reserveIds cannot be empty'
                        );
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to empty E2T reserveIds`, async() => {
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
                            t2eReserves,
                            t2eSplits,
                            e2tOpcode,
                            [],
                            e2tSplits,
                        );
                        
                        await expectRevert(
                            hintHandler.parseTokenToTokenHint(hint),
                            'reserveIds cannot be empty'
                        );
                    });

                    it(`should revert for T2T hint for T2E ${t2eTradeType}, E2T ${e2tTradeType} due to empty T2E & E2T reserveIds`, async() => {
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
                        
                        await expectRevert(
                            hintHandler.parseTokenToTokenHint(hint),
                            'reserveIds cannot be empty'
                        );
                    });
                });
            });

            Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                    it(`should revert for T2T hint for SPLIT, ${e2tTradeType} due to T2E Split ${invalidSplit}`, async() => {
                        t2eOpcode = SPLIT;
                        t2eSplits = INVALID_SPLIT_BPS[invalidSplit].value;
                        e2tOpcode = TRADE_TYPES[e2tTradeType];
                        e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];
                
                        const hint = buildHintT2T(
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
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
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                Object.keys(INVALID_SPLIT_BPS).forEach(invalidSplit => {
                    it(`should revert for T2T hint for ${t2eTradeType}, SPLIT due to E2T Split ${invalidSplit}`, async() => {
                        t2eOpcode = TRADE_TYPES[t2eTradeType];
                        t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
                        e2tOpcode = SPLIT;
                        e2tSplits = INVALID_SPLIT_BPS[invalidSplit].value;
                
                        const hint = buildHintT2T(
                            t2eOpcode,
                            t2eReserves,
                            t2eSplits,
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
            });

            Object.keys(TRADE_TYPES).forEach(t2eTradeType => {
                it(`should revert for T2T hint for ${t2eTradeType}, INVALID TYPE`, async() => {
                    t2eOpcode = TRADE_TYPES[t2eTradeType];
                    t2eSplits = (t2eTradeType == 'SPLIT') ? BPS_SPLIT : [];
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

                    await expectRevert.unspecified(
                        hintHandler.parseTokenToTokenHint(hint)
                    );
                });
            });

            Object.keys(TRADE_TYPES).forEach(e2tTradeType => {
                it(`should revert for T2T hint for INVALID TYPE, ${e2tTradeType}`, async() => {
                    t2eOpcode = INVALID_HINT_TYPE;
                    t2eSplits = [];
                    e2tOpcode = TRADE_TYPES[e2tTradeType];
                    e2tSplits = (e2tTradeType == 'SPLIT') ? BPS_SPLIT : [];

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
                    
                    await expectRevert.unspecified(
                        hintHandler.parseTokenToTokenHint(hint)
                    );
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
