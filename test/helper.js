

module.exports.isRevertErrorMessage = function( error ) {
    if( error.message.search('invalid opcode') >= 0 ) return true;
    if( error.message.search('revert') >= 0 ) return true;
    if( error.message.search('out of gas') >= 0 ) return true;
    return false;
};


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


module.exports.getBalancePromise = function( account ) {
    return new Promise(function (fulfill, reject){
        web3.eth.getBalance(account,function(err,result){
            if( err ) reject(err);
            else fulfill(result);
        });
    });
};


module.exports.getCurrentBlock = function() {
    return new Promise(function (fulfill, reject){
        web3.eth.getBlockNumber(function(err,result){
            if( err ) reject(err);
            else fulfill(result);
        });
    });
};

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



////////////////////////////////////////////////////////////////////////////////

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

module.exports.absDiff = function(num1, num2) {
    return _absDiff(num1,num2);
}

module.exports.absDiffInPercent = function(num1, num2) {
    return (_absDiff(num1,num2).div(num1)).mul(100)
}

module.exports.checkAbsDiff = function(num1, num2, maxDiffInPercentage) {
    const maxDiffBig = new BigNumber(maxDiffInPercentage);
    const diff = _absDiff(num1,num2);
    return (diff.div(num1)).lte(maxDiffInPercentage.div(100));
};

module.exports.exp = function(num1,num2) {
    const num1Math = Math.bignumber(new BigNumber(num1).toString(10));
    const num2Math = Math.bignumber(new BigNumber(num2).toString(10));

    const result = Math.pow(num1Math,num2Math);

    return new BigNumber(result.toString());
};

module.exports.ln = function(num) {
    const numMath = Math.bignumber(new BigNumber(num).toString(10));

    const result = Math.log(numMath);

    return new BigNumber(result.toString());
};

function _absDiff(num1,num2) {
    const bigNum1 = new BigNumber(num1);
    const bigNum2 = new BigNumber(num2);

    if(bigNum1.gt(bigNum2)) {
        return bigNum1.minus(bigNum2);
    }
    else {
        return bigNum2.minus(bigNum1);
    }
};