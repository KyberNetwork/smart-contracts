

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