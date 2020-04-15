const Math = require('mathjs');
const BN = web3.utils.BN;
const { constants, time } = require('@openzeppelin/test-helpers');
require("chai")
    .use(require("chai-as-promised"))
    .use(require("chai-bn")(BN))
    .should();

const BPS = new BN(10000);
const precisionUnits = (new BN(10).pow(new BN(18)));
const ethDecimals = new BN(18);
const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const zeroAddress = constants.ZERO_ADDRESS;
const emptyHint = '0x';
const zeroBN = new BN(0);
const MAX_QTY = new BN(10).pow(new BN(28));
const MAX_RATE = precisionUnits.mul(new BN(10).pow(new BN(7)));
module.exports = {BPS, precisionUnits, ethDecimals, ethAddress, zeroAddress, emptyHint, zeroBN, MAX_QTY, MAX_RATE};

module.exports.isRevertErrorMessageContains = function(error, msg) {
    return (error.message.search(msg) >= 0);
}

module.exports.isRevertErrorMessage = function( error ) {
    if( error.message.search('invalid opcode') >= 0 ) return true;
    if( error.message.search('revert') >= 0 ) return true;
    if( error.message.search('out of gas') >= 0 ) return true;
    return false;
};

module.exports.expectThrow = async function (promise, message) {
    try {
        await promise;
    } catch (error) {
        // Message is an optional parameter here
        if (message) {
            assert(
                error.message.search(message) >= 0,
                'Expected \'' + message + '\', got \'' + error + '\' instead',
            );
            return;
        } else {
            assert(
                this.isRevertErrorMessage(error),
                'Expected throw, got \'' + error + '\' instead'
            );
            return;
        }
    }
    assert.fail('Expected throw not received');
}

module.exports.sendEtherWithPromise = function( sender, recv, amount ) {
    return new Promise(function(fulfill, reject){
            web3.eth.sendTransaction({to: recv, from: sender, value: amount}, function(error, result){
            if( error ) {
                return reject(error);
            }
            else {
                return fulfill(true);
            }
        });
    });
};

function getBalancePromise(account) {
    return new Promise(function (fulfill, reject){
        web3.eth.getBalance(account,function(err,result){
            if( err ) reject(err);
            else fulfill(new BN(result));
        });
    });
};

module.exports.getBalancePromise = getBalancePromise;

module.exports.getCurrentBlock = function() {
    return new Promise(function (fulfill, reject){
        web3.eth.getBlockNumber(function(err,result){
            if( err ) reject(err);
            else fulfill(result);
        });
    });
};

module.exports.getCurrentBlockTime = function() {
    return new Promise(function (fulfill, reject){
        web3.eth.getBlock("latest", false, function(err,result){
            if( err ) reject(err);
            else fulfill(result.timestamp);
        });
    });
}

module.exports.bytesToHex = function (byteArray) {
    let strNum = toHexString(byteArray);
    let num = '0x' + strNum;
    return num;
};

function toHexString(byteArray) {
  return Array.from(byteArray, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('')
};

module.exports.sendPromise = function(method, params) {
    return new Promise(function(fulfill, reject){
        web3.currentProvider.sendAsync({
          jsonrpc: '2.0',
          method,
          params: params || [],
          id: new Date().getTime()
        }, function(err,result) {
          if (err) {
            reject(err);
          }
          else {
            fulfill(result);
          }
        });
    });
};

////////////////////////////////////////////////////////////////////////////////

module.exports.exp = function(num1,num2) {
    const num1Math = Math.bignumber(new BN(num1 * 10**9).toString(10)).div(10**9);
    const num2Math = Math.bignumber(new BN(num2 * 10**9).toString(10)).div(10**9);

    const result = Math.pow(num1Math,num2Math);

    return result.toNumber();
};

module.exports.ln = function(num) {
    const numMath = Math.bignumber(new BN(num * 10**9).toString(10)).div(10**9);

    const result = Math.log(numMath);

    return result.toNumber();
};


////////////////////////////////////////////////////////////////////////////////

function absDiffInPercent(num1, num2) {
    return (absDiff(num1,num2).div(new BN(num1))).mul(new BN(100))
}

function checkAbsDiff(num1, num2, maxDiffInPercentage) {
    const diff = absDiff(num1,num2);
    return (diff.mul(new BN(100).div(new BN(num1)))).lte(new BN(maxDiffInPercentage * 100));
};

function absDiff(num1,num2) {
    const bigNum1 = new BN(num1);
    const bigNum2 = new BN(num2);

    if(bigNum1.gt(bigNum2)) {
        return bigNum1.sub(bigNum2);
    }
    else {
        return bigNum2.sub(bigNum1);
    }
};

module.exports.assertAbsDiff = function(val1, val2, expectedDiffInPct, errorStr) {
    val1 = val1.toString()
    val2 = val2.toString()
    assert(checkAbsDiff(val1,val2,expectedDiffInPct),
            errorStr + 
           " first val is " + val1 +
           " second val is " + val2 +
           " result diff is " + absDiff(val1, val2).toString(10) +
           " actual result diff in percents is " + absDiffInPercent(val1,val2).toString(10));
}

function assertEqual (val1, val2, errorStr) {
    assert(new BN(val1).should.be.a.bignumber.that.equals(new BN(val2)), errorStr);
}

module.exports.assertEqual = assertEqual;

function assertApproximate(val1, val2, errorStr) {
    if (new BN(val2).lt(new BN(10).pow(new BN(12))))
        assertEqual(val1, val2, errorStr);
    else {
        if (new BN(val1).gt(new BN(val2)))
            assert(new BN(val1).sub(new BN(val2)).lt(new BN(1000)), errorStr);
        else
            assert(new BN(val2).sub(new BN(val1)).lt(new BN(1000)), errorStr);
    }
}

module.exports.assertApproximate = assertApproximate;

module.exports.assertGreater = function(val1, val2, errorStr) {
    assert(new BN(val1).should.be.a.bignumber.that.is.greaterThan(new BN(val2)), errorStr);
}

module.exports.assertLesser = function(val1, val2, errorStr) {
    assert(new BN(val1).should.be.a.bignumber.that.is.lessThan(new BN(val2)), errorStr);
}

module.exports.addBps = function(rate, bps) {
    return ((new BN(rate)).mul(new BN(10000 + bps)).div(new BN(10000)));
};

module.exports.calcSrcQty = function(dstQty, srcDecimals, dstDecimals, rate) {
    //source quantity is rounded up. to avoid dest quantity being too low.
    dstQty = new BN(dstQty);
    srcDecimals = new BN(srcDecimals);
    dstDecimals = new BN(dstDecimals);
    rate = new BN(rate);

    let numerator;
    let denominator;
    let precisionUnits = (new BN(10).pow(new BN(18)));
    if (srcDecimals.gte(dstDecimals)) {
        numerator = precisionUnits.mul(dstQty).mul((new BN(10)).pow(new BN(srcDecimals.sub(dstDecimals))));
        denominator = new BN(rate);
    } else {
        numerator = precisionUnits.mul(dstQty);
        denominator = (new BN(rate)).mul((new BN(10)).pow(new BN(dstDecimals.sub(srcDecimals))));
    }
    return numerator.add(denominator).sub(new BN(1)).div(denominator);;
}

module.exports.calcDstQty = function(srcQty, srcDecimals, dstDecimals, rate) {
    srcQty = new BN(srcQty);
    srcDecimals = new BN(srcDecimals);
    dstDecimals = new BN(dstDecimals);
    rate = new BN(rate);

    let precisionUnits = (new BN(10).pow(new BN(18)));
    let result;

    if (dstDecimals.gte(srcDecimals)) {
        result = ((srcQty.mul(rate).mul((new BN(10)).pow(new BN(dstDecimals.sub(srcDecimals))))).div(precisionUnits));
    } else {
        result = (srcQty).mul(rate).div(precisionUnits.mul((new BN(10)).pow(new BN(srcDecimals.sub(dstDecimals)))));
    }
    return result;
}


module.exports.assertSameEtherBalance = async function (accountAddress, expectedBalance) {
    let balance = await getBalancePromise(accountAddress);
    assertEqual(balance, expectedBalance, "wrong ether balance");
}

module.exports.assertSameTokenBalance = async function (accountAddress, token, expectedBalance) {
    let balance = await token.balanceOf(accountAddress);
    assertEqual(balance, expectedBalance, "wrong token balance");
}

module.exports.calcRateFromQty = function(srcQty, dstQty, srcDecimals, dstDecimals) {
    let decimals;
    dstDecimals = new BN(dstDecimals);

    if (dstDecimals.gte(new BN(srcDecimals))) {
        decimals = new BN(10).pow(new BN(dstDecimals - srcDecimals));
        return precisionUnits.mul(new BN(dstQty)).div((decimals).mul(new BN(srcQty)));
    } else {
        decimals = new BN(10).pow(new BN(srcDecimals - dstDecimals));
        return (precisionUnits.mul(new BN(dstQty)).mul(decimals)).div(new BN(srcQty));
    }
}

module.exports.increaseBlockNumber = async function (blocks) {
    for (let id = 0; id < blocks; id++) {
        await time.advanceBlock();
    }
}

module.exports.increaseBlockNumberTo = async function(newBlock) {
    await time.advanceBlockTo(newBlock);
}

module.exports.txAfterBlocks = async function(blocks, txFunc) {
    await module.exports.increaseBlockNumber(blocks);
    await txFunc();
}

module.exports.txAtBlock = async function(block, txFunc) {
    await module.exports.increaseBlockNumberTo(block - 1);
    await txFunc();
}

module.exports.increaseNextBlockTimestamp = async function(duration) {
  currentChainTime = await module.exports.getCurrentBlockTime();
  return new Promise((resolve, reject) => {
    web3.currentProvider.send.bind(web3.currentProvider)(
      {
        jsonrpc: "2.0",
        method: "evm_setNextBlockTimestamp",
        params: [
          currentChainTime + duration
        ],
        id: new Date().getTime(),
      },
      (err, res) => {
        if (err) {
          return reject(err);
        }
        console.log(`next block timestamp will be: ${currentChainTime + duration}`);
        resolve(res);
      },
    );
  });
}

module.exports.setNextBlockTimestamp = async function(timestamp) {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send.bind(web3.currentProvider)(
      {
        jsonrpc: "2.0",
        method: "evm_setNextBlockTimestamp",
        params: [timestamp],
        id: new Date().getTime(),
      },
      (err, res) => {
        if (err) {
          return reject(err);
        }
        resolve(res);
      },
    );
  });
}

module.exports.txAtTime = async function(timestamp, txFunc) {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send.bind(web3.currentProvider)(
      {
        jsonrpc: "2.0",
        method: "evm_setNextBlockTimestamp",
        params: [timestamp],
        id: new Date().getTime(),
      },
      (err, res) => {
        if (err) {
          return reject(err);
        }
        resolve(txFunc());
      },
    );
  });
}

module.exports.mineNewBlockAt = async function(timestamp) {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send.bind(web3.currentProvider)(
      {
        jsonrpc: "2.0",
        method: "evm_mine",
        params: [timestamp],
        id: new Date().getTime(),
      },
      (err, res) => {
        if (err) {
          return reject(err);
        }
        resolve(res);
      },
    );
  });
}

module.exports.mineNewBlockAfter = async function(duration) {
  currentChainTime = await module.exports.getCurrentBlockTime();
  return new Promise((resolve, reject) => {
    web3.currentProvider.send.bind(web3.currentProvider)(
      {
        jsonrpc: "2.0",
        method: "evm_mine",
        params: [
          currentChainTime + duration
        ],
        id: new Date().getTime(),
      },
      (err, res) => {
        if (err) {
          return reject(err);
        }
        console.log(`mined new block at: ${currentChainTime + duration}`);
        resolve(res);
      },
    );
  });
}
