// const FeeBurner = artifacts.require("FeeBurner.sol");
// const TestToken = artifacts.require("TestToken.sol");
// const MockKyberNetwork = artifacts.require("MockKyberNetwork.sol");
// const MockUtils = artifacts.require("MockUtils.sol");

// const Helper = require("./helper.js");
// const BN = web3.utils.BN;

// const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
// const zeroAddress = '0x0000000000000000000000000000000000000000';
// const precision = new BN(10).pow(new BN(18));

// //global variables
// let kncToken;
// let feeBurnerInst;
// let mockKyberNetwork;
// let mockNetwork;
// let mockReserve;
// let someReserve;
// let mockKNCWallet;
// let someExternalWallet;
// let taxWallet;
// let kncPerEthRatePrecision = precision.mul(new BN(210));
// let initialKNCWalletBalance = 10000000000;
// let burnFeeInBPS = 70;  //basic price steps
// let taxFeesInBPS = 30;
// let totalBPS = 10000;   //total price steps.
// let payedSoFar = new BN(0); //track how much fees payed or burned so far.
// let MAX_RATE;

// //accounts
// let admin;
// let operator;

// contract('FeeBurner', function(accounts) {
//     it("should init globals and init feeBurner Inst.", async function () {
//         //init globals
//         mockReserve = accounts[8];
//         mockKNCWallet = accounts[7];
//         someExternalWallet = accounts[6];
//         taxWallet = accounts[5];
//         mockKyberNetwork = accounts[4];
//         operator = accounts[1];
//         admin = accounts[0];
//         someReserve = accounts[3];

//         //move funds to knc wallet
//         kncToken = await TestToken.new("kyber", "KNC", 18);
//         await kncToken.transfer(mockKNCWallet, initialKNCWalletBalance);
//         let balance = await kncToken.balanceOf(mockKNCWallet);
//         Helper.assertEqual(balance, initialKNCWalletBalance, "unexpected wallet balance.");

//         //init fee burner
//         feeBurnerInst = await FeeBurner.new(admin, kncToken.address, mockKyberNetwork, kncPerEthRatePrecision);
//         kncPerEthRatePrecision = await feeBurnerInst.kncPerEthRatePrecision();

//         await feeBurnerInst.addOperator(operator, {from: admin});

//         //set parameters in fee burner.
//         let result = await feeBurnerInst.setReserveData(mockReserve, burnFeeInBPS, mockKNCWallet, {from: operator});

//         Helper.assertEqual(result.logs[0].args.reserve, mockReserve);
//         Helper.assertEqual(result.logs[0].args.feeInBps, burnFeeInBPS);
//         Helper.assertEqual(result.logs[0].args.kncWallet, mockKNCWallet);

//         //allowance to fee burner to enable burning
//         await kncToken.approve(feeBurnerInst.address, initialKNCWalletBalance / 10, {from: mockKNCWallet});
//         let allowance = await kncToken.allowance(mockKNCWallet, feeBurnerInst.address);
//         Helper.assertEqual(allowance, initialKNCWalletBalance / 10, "unexpected allowance");

//         let mockUtils = await MockUtils.new();
//         MAX_RATE = await mockUtils.getMaxRate();
//     });

//     it("should test handle fees success without other wallet fees.", async function () {
//         let tradeSizeWei = new BN(500000);
//         let feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);

//         let feeSize = (tradeSizeWei.mul(kncPerEthRatePrecision).div(precision)).mul(new BN(burnFeeInBPS)).div(new BN(totalBPS));

//         await feeBurnerInst.handleFees(tradeSizeWei, mockReserve, zeroAddress, {from: mockKyberNetwork});

//         let expectedWaitingFees = feeSize.add(feesWaitingToBurn);
//         feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);

//         Helper.assertEqual(feesWaitingToBurn, expectedWaitingFees, "unexpected waiting to burn.");
//     });

//     it("should test handle fees success with other wallet ID fees.", async function () {
//         let tradeSizeWei = new BN(800000);
//         let feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);

//         let feeSize = (tradeSizeWei.mul(kncPerEthRatePrecision).div(precision)).mul(new BN(burnFeeInBPS)).div(new BN(totalBPS));

//         //set other wallet fee
//         let result = await feeBurnerInst.setWalletFees(someExternalWallet, totalBPS/2);

//         Helper.assertEqual(result.logs[0].args.wallet, someExternalWallet);
//         Helper.assertEqual(result.logs[0].args.feesInBps, totalBPS/2);

//         await feeBurnerInst.handleFees(tradeSizeWei, mockReserve, someExternalWallet, {from: mockKyberNetwork});

//         let expectedWaitingFees = feeSize.div(new BN(2)).add(feesWaitingToBurn);
//         feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);
//         Helper.assertEqual(feesWaitingToBurn, expectedWaitingFees, "unexpected waiting to burn.");

//         let expectedOtherWalletWaitingFees = feeSize.div(new BN(2));

//         let waitingWalletFees = await feeBurnerInst.reserveFeeToWallet(mockReserve, someExternalWallet);
//         Helper.assertEqual(expectedOtherWalletWaitingFees, waitingWalletFees, "unexpected wallet balance.");
//     });

//     it("should test handle fees rejected with wrong caller.", async function () {
//         let tradeSizeWei = new BN(500000);
//         let feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);

//         let feeSize = (tradeSizeWei.mul(kncPerEthRatePrecision).div(precision)).mul(new BN(burnFeeInBPS)).div(new BN(totalBPS));

//         try {
//             await feeBurnerInst.handleFees(tradeSizeWei, mockReserve, zeroAddress, {from: mockReserve});
//             assert(false, "expected throw in line above..")
//         } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
//         }
//     });

//     it("should test all set set functions rejected for non admin.", async function () {
//         try {
//             await feeBurnerInst.setReserveData(mockReserve, 70, mockKNCWallet, {from: mockReserve});
//             assert(false, "expected throw in line above..")
//         } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
//         }

//         try {
//             await feeBurnerInst.setTaxInBps(taxFeesInBPS , {from: mockReserve});
//             assert(false, "expected throw in line above..")
//         } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
//         }

//         try {
//             await feeBurnerInst.setTaxWallet(taxWallet , {from: mockReserve});
//             assert(false, "expected throw in line above..")
//         } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
//         }
//     });

//     it("verify burn reverts if transferFrom knc wallet fail", async() => {
//         let feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);
//         Helper.assertGreater(feesWaitingToBurn, 1, "unexpected waiting to burn.");

//         await kncToken.approve(feeBurnerInst.address, 0, {from: mockKNCWallet});

//         try {
//             await feeBurnerInst.burnReserveFees(mockReserve);
//             assert(false, "expected throw in line above..")
//         } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
//         }

//         await kncToken.approve(feeBurnerInst.address, initialKNCWalletBalance / 10, {from: mockKNCWallet});
//     })

//     it("should test burn fee success. See waiting fees 'zeroed' (= 1).", async function () {
//         let feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);
//         Helper.assertGreater(feesWaitingToBurn, 1, "unexpected waiting to burn.");

//         waitingFees = await feeBurnerInst.reserveFeeToBurn(mockReserve);
//         addWaitingFees(payedSoFar, waitingFees);
//         await feeBurnerInst.burnReserveFees(mockReserve);

//         feesWaitingToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);
//         Helper.assertEqual(feesWaitingToBurn, 1, "unexpected waiting to burn.");

//         let waitingWalletFees = await feeBurnerInst.reserveFeeToWallet(mockReserve, someExternalWallet);
//         Helper.assertGreater(waitingWalletFees, 1, "unexpected waiting wallet fees.");

//         addWaitingFees(payedSoFar, waitingWalletFees);
//         await feeBurnerInst.sendFeeToWallet(someExternalWallet, mockReserve);

//         waitingWalletFees = await feeBurnerInst.reserveFeeToWallet(mockReserve, someExternalWallet);
//         Helper.assertEqual(waitingWalletFees, 1, "unexpected waiting wallet fees.");
//     });

//     it("should set tax fee and and tax wallet and validate values.", async function () {
//         await feeBurnerInst.setTaxWallet(taxWallet);

//         rxTaxWallet = await feeBurnerInst.taxWallet();

//         Helper.assertEqual(rxTaxWallet, taxWallet, "invalid tax wallet address");

//         //see zero address blocked.
//         try {
//             await feeBurnerInst.setTaxWallet(zeroAddress);
//             assert(false, "expected throw in line above..")
//         } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
//         }

//         Helper.assertEqual(rxTaxWallet, taxWallet, "invalid tax wallet address");

//         //set tax in BPS
//         await feeBurnerInst.setTaxInBps(taxFeesInBPS);

//         rxTaxFees = await feeBurnerInst.taxFeeBps();

//         Helper.assertEqual(rxTaxFees, taxFeesInBPS, "invalid tax fees BPS");
//     });


//     it("should test tax fees sent to wallet according to set fees.", async function () {
//         let tradeSize = 1000;

//         let taxWalletInitBalance =  await kncToken.balanceOf(taxWallet);

//         //first see with zero tax nothing sent.
//         await feeBurnerInst.setTaxWallet(taxWallet);
//         await feeBurnerInst.setTaxInBps(0);
//         await feeBurnerInst.handleFees(tradeSize, mockReserve, zeroAddress, {from: mockKyberNetwork});

//         let waitingFees = await feeBurnerInst.reserveFeeToBurn(mockReserve);
//         addWaitingFees(payedSoFar, waitingFees);

//         Helper.assertGreater(waitingFees, 0);

//         await feeBurnerInst.burnReserveFees(mockReserve);

//         let taxWalletBalance = await kncToken.balanceOf(taxWallet);
//         Helper.assertEqual(taxWalletBalance, taxWalletInitBalance);

//         //now with tax
//         await feeBurnerInst.setTaxInBps(taxFeesInBPS);
//         await feeBurnerInst.handleFees(tradeSize, mockReserve, zeroAddress, {from: mockKyberNetwork});

//         waitingFees = await feeBurnerInst.reserveFeeToBurn(mockReserve);
//         addWaitingFees(payedSoFar, waitingFees);
//         Helper.assertGreater(waitingFees, 0);
//         await feeBurnerInst.burnReserveFees(mockReserve);

//         let taxWalletBalanceAfter = await kncToken.balanceOf(taxWallet);
//         let expectedBalance = waitingFees * taxFeesInBPS / totalBPS;
//         Helper.assertEqual(taxWalletBalanceAfter, Math.floor(expectedBalance));
//     });

//     it("should test tax fees behavior with smallest values.", async function () {
//         //first create 2 wei burn fee. which will be reverted.
//         const burnFeeInBPS = 50; //0.5%
//         await feeBurnerInst.setReserveData(mockReserve, burnFeeInBPS, mockKNCWallet, {from: operator});
//         let tradeSize = 1; // * eth to knc rate is the ref number.

//         //handle fees
//         await feeBurnerInst.handleFees(tradeSize, mockReserve, zeroAddress, {from: mockKyberNetwork});
//         waitingFees = await feeBurnerInst.reserveFeeToBurn(mockReserve);
//         Helper.assertEqual(waitingFees, 2);

//         //see burn fails
//         try {
//             await feeBurnerInst.burnReserveFees(mockReserve);
//             assert(false, "expected throw in line above..")
//         } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
//         }

//         await feeBurnerInst.handleFees(tradeSize, mockReserve, zeroAddress, {from: mockKyberNetwork});
//         waitingFees = await feeBurnerInst.reserveFeeToBurn(mockReserve);
//         Helper.assertEqual(waitingFees, 3);

//         //on value 3 want to see tax wallet gets 0 fees.
//         let taxWalletInitBalance = await kncToken.balanceOf(taxWallet);
//         await feeBurnerInst.burnReserveFees(mockReserve);
//         addWaitingFees(payedSoFar, waitingFees);
//         let taxWalletBalance = await kncToken.balanceOf(taxWallet);
//         Helper.assertEqual(taxWalletBalance, taxWalletInitBalance);
//     });

//     it("should test that when knc wallet (we burn from) is empty burn fee is reverted.", async function () {
//         let initialWalletBalance = new BN(await kncToken.balanceOf(mockKNCWallet));
//         let requiredFeeSize = initialWalletBalance.add(new BN(1));
//         //create trade size that will cause fee be bigger then wallet balance.
//         let tradeSizeWei = requiredFeeSize.mul(new BN(totalBPS)).div(new BN(burnFeeInBPS)).mul(precision).div(kncPerEthRatePrecision).add(new BN(30));
//         let feeSize = (tradeSizeWei.mul(kncPerEthRatePrecision).div(precision)).mul(new BN(burnFeeInBPS)).div(new BN(totalBPS));

//         Helper.assertGreater(feeSize, requiredFeeSize, " fee size not big enough.");
//         await feeBurnerInst.handleFees(tradeSizeWei, mockReserve, zeroAddress, {from: mockKyberNetwork});

//         //now burn
//         try {
//             await feeBurnerInst.burnReserveFees(mockReserve);
//             assert(false, "expected throw in line above..")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
//         }
//     });

//     it("should test that when calling burn fees with no fees to burn call reverted.", async function () {
//         //send more tokens to wallet and approve for reserve.
//         //check current fee to burn see wallet has that amount.
//         let feeToBurn = await feeBurnerInst.reserveFeeToBurn(mockReserve);
//         Helper.assertGreater(feeToBurn, 2);
//         let numKncWalletTokens = await kncToken.balanceOf(mockKNCWallet);

// //        console.log("feeToBurn " + feeToBurn + " numKncWalletTokens " + numKncWalletTokens)

//         if (feeToBurn > numKncWalletTokens) {
//             console.log ("is smaller");
//             await kncToken.transfer(mockKNCWallet, (feeToBurn - numKncWalletTokens * 1));
//         }

//         await kncToken.approve(feeBurnerInst.address, 0xfffffffff, {from: mockKNCWallet});

//         //burn success
//         await feeBurnerInst.burnReserveFees(mockReserve);
//         addWaitingFees(payedSoFar, feeToBurn);

//         //now burn fail. since all was burned...
//         try {
//             await feeBurnerInst.burnReserveFees(mockReserve);
//             assert(false, "expected throw in line above..")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
//         }
//     });

//     it("should test can't init this contract with empty contracts (address 0).", async function () {
//         let feeBurnerTemp;

//         try {
//             feeBurnerTemp =  await FeeBurner.new(admin, zeroAddress, mockKyberNetwork, kncPerEthRatePrecision);
//             assert(false, "throw was expected in line above.")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             feeBurnerTemp =  await FeeBurner.new(zeroAddress, kncToken.address, mockKyberNetwork, kncPerEthRatePrecision);
//             assert(false, "throw was expected in line above.")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             feeBurnerTemp =  await FeeBurner.new(admin, kncToken.address, zeroAddress, kncPerEthRatePrecision);
//             assert(false, "throw was expected in line above.")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         try {
//             feeBurnerTemp =  await FeeBurner.new(admin, kncToken.address, mockKyberNetwork, 0);
//             assert(false, "throw was expected in line above.")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         feeBurnerTemp =  await FeeBurner.new(admin, kncToken.address, mockKyberNetwork, kncPerEthRatePrecision);
//     });

//     it("should test can't set bps fee > 1% (100 bps).", async function () {
//         let highBpsfee = 101;

//         try {
//             await feeBurnerInst.setReserveData(mockReserve, highBpsfee, mockKNCWallet, {from: operator});
//             assert(false, "throw was expected in line above.")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //see success
//         await feeBurnerInst.setReserveData(mockReserve, 99, mockKNCWallet, {from: operator});
//     });


//     it("should test can't set empty (address 0) knc wallet.", async function () {
//         try {
//             await feeBurnerInst.setReserveData(mockReserve, 99, zeroAddress, {from: operator});
//             assert(false, "throw was expected in line above.")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //see success
//         await feeBurnerInst.setReserveData(mockReserve, 99, mockKNCWallet, {from: operator});
//     });

//     it("should test can't set wallet fees above 100% (10000 bps).", async function () {
//         let highBpsfee = 10000;

//         try {
//             await feeBurnerInst.setWalletFees(someExternalWallet, highBpsfee);
//             assert(false, "throw was expected in line above.")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //see success
//         await feeBurnerInst.setWalletFees(someExternalWallet, 9999);
//     });

//     it("should test can't fee taxes above 100% (10000 bps).", async function () {
//         let highBpsTax = 10000;
//         let validBpsTax = 9999;

//         try {
//             await feeBurnerInst.setTaxInBps(highBpsTax);
//             assert(false, "throw was expected in line above.")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         //see success
//         await feeBurnerInst.setTaxInBps(validBpsTax);
//     });

//     it("should test send fees to wallet reverted when balance is 'zeroed' == 1.", async function () {
//         try {
//             await feeBurnerInst.sendFeeToWallet(someExternalWallet, mockReserve);
//             assert(false, "throw was expected in line above.")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
//     });


//     it("should test handle fees reverted when trade size > max trade size.", async function () {
//         let legalTrade = new BN(10).pow(new BN(28));
//         let illegalTrade = legalTrade.add(new BN(1));

//         await feeBurnerInst.handleFees(legalTrade, mockReserve, someExternalWallet, {from: mockKyberNetwork});

//         try {
//             await feeBurnerInst.handleFees(illegalTrade, mockReserve, zeroAddress, {from: mockKyberNetwork});
//             assert(false, "expected throw in line above..")
//         } catch(e) {
//                 assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
//         }
//     });

//     it("should test when calling send fees to wallet but knc wallet doesn't have enough tokens. call reverted.", async function () {
//         let waitingWalletFees = await feeBurnerInst.reserveFeeToWallet(mockReserve, someExternalWallet);
//         let numKncWalletTokens = await kncToken.balanceOf(mockKNCWallet);

//         //now send fees fail. since all was burned...
//         try {
//             await feeBurnerInst.sendFeeToWallet(someExternalWallet, mockReserve);
//             assert(false, "expected throw in line above..")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
//         }
//     });

//     it("should verify payed so far on this reserve.", async function () {
//         let rxPayedSoFar = await feeBurnerInst.feePayedPerReserve(mockReserve);

//         Helper.assertEqual(rxPayedSoFar, payedSoFar);
//     });

//     it("should test tax fees revert when knc.transferFrom doesn't return true value.", async function () {
//         //first create 2 wei burn fee. which will be reverted.
//         await feeBurnerInst.setTaxInBps(9999);
//         await feeBurnerInst.setTaxWallet(taxWallet);
//         const burnFeeInBPS = 50; //0.5%
//         await feeBurnerInst.setReserveData(someReserve, burnFeeInBPS, mockKNCWallet, {from: operator});
//         let tradeSize = 3; // * eth to knc rate is the ref number.

//         //handle fees
//         await feeBurnerInst.handleFees(tradeSize, someReserve, zeroAddress, {from: mockKyberNetwork});
//         waitingFees = await feeBurnerInst.reserveFeeToBurn(someReserve);
//         Helper.assertEqual(waitingFees, 3);

//         await kncToken.approve(feeBurnerInst.address, 0, {from: mockKNCWallet});

//         try {
//             await feeBurnerInst.burnReserveFees(someReserve);
//             assert(false, "expected throw in line above..")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
//         }

//         await kncToken.approve(feeBurnerInst.address, initialKNCWalletBalance / 10, {from: mockKNCWallet});
//     });

//     it("should test set knc rate gets rate from kyber network", async function () {
//  //init mock kyber network and set knc rate
// //        log("create mock")
//         ethKncRate = 431;
//         mockKyberNetwork = await MockKyberNetwork.new();
//         let ethToKncRatePrecision = precision.mul(new BN(ethKncRate));
//         let kncToEthRatePrecision = precision.div(new BN(ethKncRate));

// //        log("set pair rate")
//         await mockKyberNetwork.setPairRate(ethAddress, kncToken.address, ethToKncRatePrecision);
//         await mockKyberNetwork.setPairRate(kncToken.address, ethAddress, kncToEthRatePrecision);

//         let rate = await mockKyberNetwork.getExpectedRate(ethAddress, kncToken.address, new BN(10).pow(new BN(18)));
//         Helper.assertEqual(ethToKncRatePrecision, rate[0]);
//         rate = await mockKyberNetwork.getExpectedRate(kncToken.address, ethAddress, new BN(10).pow(new BN(18)));
//         Helper.assertEqual(kncToEthRatePrecision, rate[0]);

//         //init fee burner
//         feeBurnerInst = await FeeBurner.new(admin, kncToken.address, mockKyberNetwork.address, kncPerEthRatePrecision);
//         await feeBurnerInst.addOperator(operator, {from: admin});

//         await feeBurnerInst.setKNCRate();
//         let rxKncRate = await feeBurnerInst.kncPerEthRatePrecision()
//         Helper.assertEqual(rxKncRate, ethToKncRatePrecision);

//         //see rate the same. not matter what min max are
//         await feeBurnerInst.setKNCRate();
//         rxKncRate = await feeBurnerInst.kncPerEthRatePrecision()
//         Helper.assertEqual(rxKncRate, ethToKncRatePrecision);

//         //update knc rate in kyber network
//         let oldRate = ethToKncRatePrecision;
//         kncPerEthRatePrecision = 1000;
//         ethToKncRatePrecision = precision.mul(new BN(kncPerEthRatePrecision));
//         kncToEthRatePrecision = precision.div(new BN(kncPerEthRatePrecision));
//         await mockKyberNetwork.setPairRate(ethAddress, kncToken.address, ethToKncRatePrecision);
//         await mockKyberNetwork.setPairRate(kncToken.address, ethAddress, kncToEthRatePrecision);

//         //verify old rate still exists
//         rxKncRate = await feeBurnerInst.kncPerEthRatePrecision()
//         Helper.assertEqual(rxKncRate, oldRate);

//         await feeBurnerInst.setKNCRate();
//         rxKncRate = await feeBurnerInst.kncPerEthRatePrecision()
//         Helper.assertEqual(rxKncRate, ethToKncRatePrecision);
//     });

//     it("should test 'set KNC rate' reverted when min is 0.", async function () {
//         //set pair rate to 0
//         ethToKncRatePrecision = 0;
//         kncToEthRatePrecision = 0;
//         await mockKyberNetwork.setPairRate(ethAddress, kncToken.address, ethToKncRatePrecision);
//         await mockKyberNetwork.setPairRate(kncToken.address, ethAddress, kncToEthRatePrecision);
//         let rate = await mockKyberNetwork.getExpectedRate(ethAddress, kncToken.address, new BN(10).pow(new BN(18)));
//         Helper.assertEqual(0, rate[0]);

//         try {
//             await feeBurnerInst.setKNCRate();
//             assert(false, "throw was expected in line above.")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }
//     });

//     it("should test 'set KNC rate' reverted when kncRate above max rate.", async function () {
//         //set pair rate to 0
//         ethKncRate = (new BN(MAX_RATE)).div(precision).add(new BN(1));
//         let ethToKncRatePrecision = precision.mul(ethKncRate);
//         let kncToEthRatePrecision = precision.div(ethKncRate);
//         await mockKyberNetwork.setPairRate(ethAddress, kncToken.address, ethToKncRatePrecision);
//         await mockKyberNetwork.setPairRate(kncToken.address, ethAddress, kncToEthRatePrecision);

//         let rate = await mockKyberNetwork.getExpectedRate(ethAddress, kncToken.address, new BN(10).pow(new BN(18)));
//         assert(rate[0].gt(MAX_RATE));

//         try {
//             await feeBurnerInst.setKNCRate();
//             assert(false, "throw was expected in line above.")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
//         }

//         ethKncRate = 431;
//         ethToKncRatePrecision = precision.mul(new BN(ethKncRate));
//         kncToEthRatePrecision = precision.div(new BN(ethKncRate));
//         await mockKyberNetwork.setPairRate(ethAddress, kncToken.address, ethToKncRatePrecision);
//         await mockKyberNetwork.setPairRate(kncToken.address, ethAddress, kncToEthRatePrecision);
//     });

//     it("should check event for 'set knc rate'", async function () {
//         ethKncRate = 431;
//         let ethToKncRatePrecision = precision.mul(new BN(ethKncRate));
//         let kncToEthRatePrecision = precision.div(new BN(ethKncRate));
//         await mockKyberNetwork.setPairRate(ethAddress, kncToken.address, ethToKncRatePrecision);
//         await mockKyberNetwork.setPairRate(kncToken.address, ethAddress, kncToEthRatePrecision);

//         let rc = await feeBurnerInst.setKNCRate({from: accounts[7]});
// //        console.log(rc.logs[0].args)
//         Helper.assertEqual(rc.logs[0].event, 'KNCRateSet');
//         Helper.assertEqual(rc.logs[0].args.ethToKncRatePrecision, ethToKncRatePrecision);
//         Helper.assertEqual(rc.logs[0].args.kyberEthKnc, ethToKncRatePrecision);
//         Helper.assertEqual(rc.logs[0].args.kyberKncEth, kncToEthRatePrecision);
//         Helper.assertEqual(rc.logs[0].args.updater, accounts[7]);

//         //verify event isn't affected from min and max
//         rc = await feeBurnerInst.setKNCRate({from: accounts[3]});
//         Helper.assertEqual(rc.logs[0].event, 'KNCRateSet');
//         Helper.assertEqual(rc.logs[0].args.ethToKncRatePrecision, ethToKncRatePrecision);
//         Helper.assertEqual(rc.logs[0].args.kyberEthKnc, ethToKncRatePrecision);
//         Helper.assertEqual(rc.logs[0].args.kyberKncEth, kncToEthRatePrecision);
//         Helper.assertEqual(rc.logs[0].args.updater, accounts[3]);
//     });

//     it("verify if spread in kyber too big (rate tampered). can't set knc rate in fee burner", async function () {
//         kncPerEthRatePrecision = 400;
//         kncPerEthRatePrecisionWSpread = kncPerEthRatePrecision * 2.0001;
//         let ethToKncRatePrecision = precision.mul(new BN(kncPerEthRatePrecisionWSpread));
//         let kncToEthRatePrecision = precision.div(new BN(kncPerEthRatePrecision));

//         await mockKyberNetwork.setPairRate(ethAddress, kncToken.address, ethToKncRatePrecision);
//         await mockKyberNetwork.setPairRate(kncToken.address, ethAddress, kncToEthRatePrecision);

//         //now spread > x2
//         try {
//             let rc = await feeBurnerInst.setKNCRate();
//             assert(false, "expected throw in line above..")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
//         }

//         kncPerEthRatePrecisionWSpread = kncPerEthRatePrecision * 1.99999;
//         ethToKncRatePrecision = precision.mul(new BN(kncPerEthRatePrecisionWSpread));

//         await mockKyberNetwork.setPairRate(ethAddress, kncToken.address, ethToKncRatePrecision);
//         let rate = await mockKyberNetwork.getExpectedRate(ethAddress, kncToken.address, new BN(10).pow(new BN(18)));
//         Helper.assertEqual(ethToKncRatePrecision, rate[0]);

//         let rc = await feeBurnerInst.setKNCRate();

//         kncPerEthRatePrecisionWSpread = kncPerEthRatePrecision * 0.6;
//         kncToEthRatePrecision = precision.div(new BN(kncPerEthRatePrecision));
//         ethToKncRatePrecision = precision.mul(new BN(kncPerEthRatePrecisionWSpread));

//         await mockKyberNetwork.setPairRate(kncToken.address, ethAddress, kncToEthRatePrecision);
//         await mockKyberNetwork.setPairRate(ethAddress, kncToken.address, ethToKncRatePrecision);

//         rc = await feeBurnerInst.setKNCRate({from: accounts[3]});

//         //now higher spread
//         kncPerEthRatePrecisionWSpread = kncPerEthRatePrecision * 0.499999;
//         ethToKncRatePrecision = precision.mul(new BN(kncPerEthRatePrecisionWSpread));

//         await mockKyberNetwork.setPairRate(ethAddress, kncToken.address, ethToKncRatePrecision);

//         try {
//             let rc = await feeBurnerInst.setKNCRate();
//             assert(false, "expected throw in line above..")
//         } catch(e) {
//             assert(Helper.isRevertErrorMessage(e), "expected throw but got other error: " + e);
//         }
//     });
// });

// function addWaitingFees(payedTillNow, theFee) {
//     payedTillNow.iadd(theFee.sub(new BN(1)));
// }

// function log(str) {
//     console.log(str)
// }
