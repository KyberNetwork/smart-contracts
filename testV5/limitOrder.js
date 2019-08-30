const BN = require('bignumber.js');
const truffleAssert = require("truffle-assertions");
const Helper = require("./helper.js");
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const MockKyberNetwork = artifacts.require('MockKyberNetwork.sol');
const KyberSwapLimitOrder = artifacts.require('KyberSwapLimitOrderV5.sol');
const TestToken = artifacts.require('TestTokenV5.sol');
const SafeERC20Wrapper = artifacts.require('SafeERC20WrapperV5.sol');

/////////////////
/// Addresses ///
/////////////////
let user1PrivateKey = Helper.generatePrivateKey();
let user1Address = Helper.privateKeyToAddress(user1PrivateKey);
let user1Account = {'address': user1Address, 'privateKey': user1PrivateKey, 'nonce': 0};

///////////////////////////////
/// Auto generated accounts ///
///////////////////////////////
let admin;
let operator;
let testTradeUser;

/////////////////
/// Contracts ///
/////////////////
let kncToken;
let network;

////////////////////
/// Token Params ///
////////////////////
let NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
let ETH_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
let tokenDecimals = 18;
let tokenPrecision = (new BN('10')).pow(tokenDecimals);
let ratePrecision = tokenPrecision;
let initialEtherAmount = (new BN('10')).pow(tokenDecimals).mul(10); //10 ETH
let tokenRate = (new BN('10')).pow(tokenDecimals-2);
let userTokenQtyWei = (new BN('1000000')).mul(tokenPrecision); //1M tokens to user
let limitOrderWei = (new BN('100')).mul(tokenPrecision);
let maxTokenAllowance = new BN('2').pow(256).minus(1);
let maxFeePrecision = new BN('100').mul(new BN('10').pow(4));
let feeAmountInPrecision = new BN('10000'); //1%

///////////////////////
/// Other Variables ///
///////////////////////
let nonce;
let concatenatedAddresses;

contract('KyberSwapLimitOrder', function(accounts) {
  before("setup", async() => {
    //admin account for deployment of contracts
    admin = accounts[0];

    //non-admin account
    operator = accounts[1];

    //test trade user for network trade
    testTradeUser = accounts[2];

    //send 10 ETH to address
    await Helper.sendEtherWithPromise(accounts[3], user1Address, initialEtherAmount.valueOf());

    user1Balance = await Helper.getBalancePromise(user1Address);
    assert.equal(user1Balance.valueOf(),initialEtherAmount.valueOf(),"user1 initial ether balance not as expected");
  });

  it("deploy contracts and initialise values", async function () {
    kncToken = await TestToken.new("KyberNetworkCrystal", "KNC" , tokenDecimals, {from: admin});
    network = await MockKyberNetwork.new({from: admin});
    limitOrder = await KyberSwapLimitOrder.new(admin, network.address, {from: admin});
    assert.equal(await limitOrder.kyberNetworkProxy(),network.address, {from: admin});

    //transfer 1M kncTokens to user1 and testTradeUser
    await kncToken.transfer(user1Address, userTokenQtyWei.toFixed(), {from: admin});
    await kncToken.transfer(testTradeUser, userTokenQtyWei.toFixed(), {from: admin});

    //transfer ETH to network contract
    let initialEther = (new BN(10)).pow(18).mul(50); //50 ether
    await Helper.sendEtherWithPromise(accounts[8], network.address, initialEther.toFixed());
  });

  it("should re-instantiate relevant contracts via web3", async function() {
    //needed for signing and broadcasting txs with web3 generated accounts
    kncTokenWeb3 = new web3.eth.contract(kncToken.abi);
    kncTokenWeb3 = kncTokenWeb3.at(kncToken.address);
    limitOrderWeb3 = new web3.eth.contract(limitOrder.abi);
    limitOrderWeb3 = limitOrderWeb3.at(limitOrder.address);
  });

  it("should not have limit order contract instantiated with null addresses", async function() {
    try {
      await KyberSwapLimitOrder.new(NULL_ADDRESS, network.address, {from: admin});
      assert(false,"throw was expected in line above.");
    } catch(e) {
      assert(Helper.isRevertErrorMessage(e),"expected throw but got: " + e);
    }

    try {
      await KyberSwapLimitOrder.new(admin, NULL_ADDRESS, {from: admin});
      assert(false,"throw was expected in line above.");
    } catch(e) {
      assert(Helper.isRevertErrorMessage(e),"expected throw but got: " + e);
    }
  });

  it("should have user1 give allowance to token contract", async function () {
    //user1 give allowance to limit order contract for trades
    data = kncTokenWeb3.approve.getData(limitOrder.address,maxTokenAllowance.toFixed());
    await Helper.sendTx(user1Account,kncToken.address,data);

    actualKncAllowance = await kncToken.allowance(user1Address,limitOrder.address);
    actualKncAllowance = new BN(actualKncAllowance);

    assert.equal(maxTokenAllowance.valueOf(),actualKncAllowance.valueOf(),"actual KNC token allowance not equal to expected")
  });

  it("should initialise network, rate and test trade", async function () {
    //kncToken -> ETH
    await network.setPairRate(kncToken.address, ETH_ADDRESS, tokenRate.toFixed(), {from: admin});
    actualRates = await network.getExpectedRate.call(kncToken.address,ETH_ADDRESS,1000);
    actualExpectedRate = actualRates[0];
    assert.equal(tokenRate.valueOf(),actualExpectedRate.valueOf(),"Incorrect expected rate for kncToken")

    //test user gives allowance to network for test trade
    await kncToken.approve(network.address, maxTokenAllowance.toFixed(), {from: testTradeUser});

    //Perform test trade of 1000 kncToken wei with network
    //testTradeUser performs trade, but sends converted ETH to admin, since he'll be paying for gas
    //ie. destAddress = admin
    let srcTokenWei = 1000;
    let initialBalanceEther = await Helper.getBalancePromise(admin);
    let initialTokenBalance = await kncToken.balanceOf.call(testTradeUser);
    initialTokenBalance = new BN(initialTokenBalance);
    await network.tradeWithHint(kncToken.address, srcTokenWei, ETH_ADDRESS, admin,
      1000000, 0, NULL_ADDRESS, "", {from: testTradeUser});
    let expectedEtherPayment = (new BN(srcTokenWei)).mul(tokenRate).div(ratePrecision);
    expectedEtherPayment = expectedEtherPayment.minus(expectedEtherPayment.mod(1));
    let expectedEtherBalance = expectedEtherPayment.plus(initialBalanceEther);
    let expectedTokenBalance = initialTokenBalance.minus(srcTokenWei);
    let actualEtherBalance = await Helper.getBalancePromise(admin);
    actualEtherBalance = new BN(actualEtherBalance);
    let actualTokenBalance = await kncToken.balanceOf.call(testTradeUser);
    actualTokenBalance = new BN(actualTokenBalance);
    assert.equal(actualEtherBalance.valueOf(), expectedEtherBalance.valueOf(),"Ether balance not as expected after KNC -> ETH trade");
    assert.equal(actualTokenBalance.valueOf(), expectedTokenBalance.valueOf(), "Token balance not as expected after KNC -> ETH trade");
  });

  it("should have operator added to limit order contract", async function() {
    await limitOrder.addOperator(operator,{from: admin});
    isOperator = await limitOrder.operators(operator);
    assert.isTrue(isOperator,"Operator was not added successfully");
  });

  it("should not have tokens listed by non-admin", async function() {
    try {
      await limitOrder.listToken(kncToken.address,{from: operator});
      assert(false,"throw was expected in line above.");
    } catch(e) {
      assert(Helper.isRevertErrorMessage(e),"expected throw but got: " + e);
    }
  });

  it("should have tokens listed by admin", async function() {
    await limitOrder.listToken(kncToken.address, {from: admin});

    kncAllowance = await kncToken.allowance(limitOrder.address,network.address);
    kncAllowance = new BN(kncAllowance);

    assert.equal(kncAllowance.valueOf(),maxTokenAllowance.valueOf(),"token listing failed by admin");
  });

  it("should not have null address listed by admin", async function() {
    try {
      await limitOrder.listToken(NULL_ADDRESS, {from: admin});
      assert(false,"throw was expected in line above.");
    } catch(e) {
      assert(Helper.isRevertErrorMessage(e),"expected throw but got: " + e);
    }
  });

  it("should not have trades enabled by non-admin", async function() {
    try {
      //should fail if non-admin tries to enable trade
      await limitOrder.enableTrade({from: operator});
      assert(false,"throw was expected in line above.");
    } catch(e) {
      assert(Helper.isRevertErrorMessage(e),"expected throw but got: " + e);
    }
  });

  it("should have trades enabled by admin", async function () {
    await limitOrder.enableTrade({from: admin});
    assert.isTrue(await limitOrder.tradeEnabled(), "trade was not enabled by admin");
  });

  it("should not have trades disabled by non-admin", async function () {
    try {
      await limitOrder.disableTrade({from: operator});
      assert(false,"throw was expected in line above.");
    } catch(e) {
      assert(Helper.isRevertErrorMessage(e),"expected throw but got: " + e);
    }
  });

  it("should have trades disabled by admin", async function () {
    await limitOrder.disableTrade({from: admin});
    assert.isFalse(await limitOrder.tradeEnabled(), "trade was not disabled by admin");
  });

  it("should return true for valid address in nonce", async function () {
    nonce = Helper.getNonce(limitOrder.address);
    assert.isTrue(await limitOrder.validAddressInNonce.call(nonce),"returned false for valid address in nonce");
  });
  //
  it("should return false for invalid address in nonce", async function () {
    nonce = Helper.getNonce(network.address);
    assert.isFalse(await limitOrder.validAddressInNonce.call(nonce),"returned true for invalid address in nonce");
  });

  it("should correctly return concatenated token addresses in uint", async function () {
    expectedConcatenatedAddresses = Helper.getConcatenatedTokenAddresses(kncToken.address,ETH_ADDRESS);
    actualConcatenatedAddresses = await limitOrder.concatTokenAddresses.call(kncToken.address,ETH_ADDRESS);
    actualConcatenatedAddresses = new BN(actualConcatenatedAddresses);
    assert.equal(expectedConcatenatedAddresses.valueOf(),actualConcatenatedAddresses.valueOf());
  });

  it("should return true for valid nonce", async function () {
    expectedNonce = Helper.getNonce(limitOrder.address);
    concatenatedAddresses = Helper.getConcatenatedTokenAddresses(kncToken.address,ETH_ADDRESS);
    assert(await limitOrder.isValidNonce.call(user1Address,concatenatedAddresses.toFixed(),nonce),"returned false for valid nonce");
  });

  it("should return false for invalid nonce", async function () {
    nonce = Helper.getNonce(limitOrder.address,0); //timestamp of zero
    await limitOrder.invalidateOldOrders(concatenatedAddresses.toFixed(),nonce,{from: operator});
    assert.isFalse(await limitOrder.isValidNonce.call(operator,concatenatedAddresses.toFixed(),nonce),"returned true for invalid nonce");
  });

  it("should prevent updating with an old nonce", async function () {
    olderNonce = Helper.getNonce(limitOrder.address);
    await sleep(1);
    newerNonce = Helper.getNonce(limitOrder.address);
    await limitOrder.invalidateOldOrders(concatenatedAddresses.toFixed(),newerNonce,{from: operator});
    try {
      await limitOrder.invalidateOldOrders(concatenatedAddresses.toFixed(),olderNonce,{from: operator});
      assert(false,"throw was expected in line above.");
    } catch (e) {
      assert(Helper.isRevertErrorMessage(e),"expected throw but got: " + e);
    }
  });

  it("should correctly deduct fees for valid fees", async function () {
    expectedFeeAmount = feeAmountInPrecision.div(maxFeePrecision).mul(limitOrderWei);
    expectedTokenQtyToSwap = limitOrderWei.minus(expectedFeeAmount);

    result = await limitOrder.deductFee.call(limitOrderWei.toFixed(),feeAmountInPrecision.toFixed());
    actualTokenQtyToSwap = result[0];
    actualFeeAmount = result[1];
    assert.equal(expectedTokenQtyToSwap.valueOf(),actualTokenQtyToSwap.valueOf(),"token quantities to swap don't match");
    assert.equal(expectedFeeAmount.valueOf(),actualFeeAmount.valueOf(),"fee amounts don't match");
  });

  it("should revert when fee exceeds max fee precision", async function () {
    try {
      let exceededFeeAmount = maxFeePrecision.plus(1);
      await limitOrder.deductFee.call(limitOrderWei.toFixed(),exceededFeeAmount.toFixed());
      assert(false,"throw was expected in line above.");
    } catch(e) {
      assert(Helper.isRevertErrorMessage(e),"expected throw but got: " + e);
    }
  });

  it("should have zero srcQty if fee is 100%", async function () {
    expectedTokenQtyToSwap = new BN('0');
    expectedFeeAmount = limitOrderWei;

    result = await limitOrder.deductFee.call(limitOrderWei.toFixed(),maxFeePrecision.toFixed());
    actualTokenQtyToSwap = result[0];
    actualFeeAmount = result[1];
    assert.equal(expectedTokenQtyToSwap.valueOf(),actualTokenQtyToSwap.valueOf(),"token quantities to swap don't match");
    assert.equal(expectedFeeAmount.valueOf(),actualFeeAmount.valueOf(),"fee amounts don't match");
  });

  it("should return zero fees if fee is 0%", async function () {
    expectedTokenQtyToSwap = limitOrderWei;
    expectedFeeAmount = new BN('0');

    result = await limitOrder.deductFee.call(limitOrderWei.toFixed(),new BN('0').toFixed());
    actualTokenQtyToSwap = result[0];
    actualFeeAmount = result[1];
    assert.equal(expectedTokenQtyToSwap.valueOf(),actualTokenQtyToSwap.valueOf(),"token quantities to swap don't match");
    assert.equal(expectedFeeAmount.valueOf(),actualFeeAmount.valueOf(),"fee amounts don't match");
  });

  it("should correctly update nonce upon manually invalidating old orders", async function () {
    concatenatedAddresses = Helper.getConcatenatedTokenAddresses(kncToken.address,ETH_ADDRESS);
    expectedNonce = Helper.getNonce(limitOrder.address);
    expectedNonce = expectedNonce.toLowerCase()
    await limitOrder.invalidateOldOrders(concatenatedAddresses.toFixed(),expectedNonce, {from: operator});
    actualNonce = await limitOrder.nonces.call(operator,concatenatedAddresses.toFixed());
    actualNonce = actualNonce.toString(16);
    //handle edge case where concatenatedAddresses' first char is zero
    if(actualNonce.length == 63) actualNonce = '0' + actualNonce;
    actualNonce = '0x' + actualNonce;
    assert.equal(expectedNonce,actualNonce,"expected nonce not equal to actual nonce");
  });

  it("should revert invalidateOldOrders if nonce is older than the one stored in the contract", async function () {
    concatenatedAddresses = Helper.getConcatenatedTokenAddresses(kncToken.address,ETH_ADDRESS);
    olderNonce = Helper.getNonce(limitOrder.address);
    await sleep(1);
    newerNonce = Helper.getNonce(limitOrder.address);
    await limitOrder.invalidateOldOrders(concatenatedAddresses.toFixed(),newerNonce);
    try {
      await limitOrder.invalidateOldOrders(concatenatedAddresses.toFixed(),olderNonce);
      assert(false,"throw was expected in line above.");
    } catch (e) {
      assert(Helper.isRevertErrorMessage(e),"expected throw but got: " + e);
    }
  });

  it("should revert invalidateOldOrders for invalid address in nonce", async function() {
    concatenatedAddresses = Helper.getConcatenatedTokenAddresses(kncToken.address,ETH_ADDRESS);
    nonce = Helper.getNonce(kncToken.address);
    try {
      await limitOrder.invalidateOldOrders(concatenatedAddresses.toFixed(),nonce);
      assert(false,"throw was expected in line above.");
    } catch (e) {
      assert(Helper.isRevertErrorMessage(e),"expected throw but got: " + e);
    }
  });

  it("should enable trade for subsequent test cases", async function () {
    await limitOrder.enableTrade({from: admin});
    assert(await limitOrder.tradeEnabled())
  });

  it("should execute a valid limit order by operator", async function () {
    userInitialTokenBalance = await kncToken.balanceOf(user1Address);
    userInitialBalanceEther = await Helper.getBalancePromise(user1Address);
    expectedTokenBalance = new BN(userInitialTokenBalance).minus(limitOrderWei);

    feeAmount = feeAmountInPrecision.div(maxFeePrecision).mul(limitOrderWei);
    tokenQtyToSwap = limitOrderWei.minus(feeAmount);
    expectedEtherPayment = (new BN(tokenQtyToSwap)).mul(tokenRate).div(ratePrecision);
    expectedEtherPayment = expectedEtherPayment.minus(expectedEtherPayment.mod(1));
    expectedEtherBalance = expectedEtherPayment.plus(userInitialBalanceEther);

    nonce = Helper.getNonce(limitOrder.address);
    sig = Helper.getLimitOrderSignature(user1Account,nonce,kncToken.address,
      limitOrderWei.valueOf(),ETH_ADDRESS,user1Address,0,feeAmountInPrecision.valueOf());

    await limitOrder.executeLimitOrder(
      user1Address,nonce,kncToken.address,limitOrderWei.valueOf(),
      ETH_ADDRESS,user1Address,0,feeAmountInPrecision.valueOf(),
      sig.v,sig.r,sig.s,
      {from: operator}
    );

    let actualTokenBalance = await kncToken.balanceOf(user1Address);
    actualTokenBalance = new BN(actualTokenBalance);
    let actualEtherBalance = await Helper.getBalancePromise(user1Address);
    actualEtherBalance = new BN(actualEtherBalance);

    assert.equal(expectedTokenBalance.valueOf(),actualTokenBalance.valueOf(),"token balances did not tally after order");
    assert.equal(expectedEtherBalance.valueOf(),actualEtherBalance.valueOf(),"ether balances did not tally after order");
  });

  it("should not have a valid limit order executed by admin", async function() {
    nonce = Helper.getNonce(limitOrder.address);
    sig = Helper.getLimitOrderSignature(user1Account,nonce,kncToken.address,
      limitOrderWei.toFixed(),ETH_ADDRESS,user1Address,0,feeAmountInPrecision.toFixed());

    try {
      await limitOrder.executeLimitOrder(
        user1Address,expectedNonce,kncToken.address,limitOrderWei.toFixed(),
        ETH_ADDRESS,user1Address,0,feeAmountInPrecision.toFixed(),
        sig.v,sig.r,sig.s,
        {from: admin}
      );
      assert(false,"throw was expected in line above.");
    } catch(e) {
      assert(Helper.isRevertErrorMessage(e),"expected throw but got: " + e);
    }
  });

  it("should not have a valid limit order executed by non-operator", async function () {
    nonce = Helper.getNonce(limitOrder.address);
    sig = Helper.getLimitOrderSignature(user1Account,nonce,kncToken.address,
      limitOrderWei.toFixed(),ETH_ADDRESS,user1Address,0,feeAmountInPrecision.toFixed());

    try {
      await limitOrder.executeLimitOrder(
        user1Address,expectedNonce,kncToken.address,limitOrderWei.toFixed(),
        ETH_ADDRESS,user1Address,0,feeAmountInPrecision.toFixed(),
        sig.v,sig.r,sig.s,
        {from: testTradeUser}
      );
      assert(false,"throw was expected in line above.");
    } catch(e) {
      assert(Helper.isRevertErrorMessage(e),"expected throw but got: " + e);
    }
  });
});
