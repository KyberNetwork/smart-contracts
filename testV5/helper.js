var secp256k1 = require("secp256k1");
var ethUtils = require("ethereumjs-util");
const BN = require('bignumber.js');
const Sha3 = require('solidity-sha3').default;
const EthereumTx = require('ethereumjs-tx').Transaction;

module.exports.isRevertErrorMessage = function( error ) {
    if( error.message.search('invalid opcode') >= 0 ) return true;
    if( error.message.search('revert') >= 0 ) return true;
    if( error.message.search('out of gas') >= 0 ) return true;
    return false;
};

module.exports.generatePrivateKey = function() {
  seed = "real men use go to sign (and not javascript)"
  for (i=0;i<10;i++) {
    seed += Math.floor((Math.random() * 100) + 1);
  }
  return "0x" + ethUtils.keccak256(seed).toString('hex');
}

module.exports.sendTx = async function(sender,receiver,data) {
  const tx = new EthereumTx({
    nonce: sender.nonce,
    from: sender.address,
    to: receiver,
    data: data,
    gasPrice: 5,
    gasLimit: 500000
  });

  //strip 0x prefix
  privateKey = sender.privateKey.substring(2);
  privateKey = new Buffer.from(privateKey,'hex');
  tx.sign(privateKey);
  serialisedTx = tx.serialize();
  web3.eth.sendRawTransaction('0x' + serialisedTx.toString('hex'),function(err,res){});
  sender.nonce++;
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

module.exports.privateKeyToAddress = function(key) {
  const privateKey = ethUtils.toBuffer(key);
  const pubKey = ethUtils.privateToPublic(privateKey);
  return "0x" + ethUtils.publicToAddress(pubKey).toString('hex');
}

function ecsign(msgHash, privateKey) {
  msgHashWithPrefix = Sha3("\x19Ethereum Signed Message:\n32", msgHash);
  msgHashWithPrefix = ethUtils.toBuffer(msgHashWithPrefix);
  const sig = secp256k1.sign(msgHashWithPrefix, ethUtils.toBuffer(privateKey));
  const ret = {};
  ret.msgHash = msgHash;
  ret.r = "0x" + ethUtils.setLength(sig.signature.slice(0, 32),32).toString('hex')
  ret.s = "0x" + ethUtils.setLength(sig.signature.slice(32, 64),32).toString('hex')
  ret.v = "0x" + ethUtils.toBuffer(sig.recovery + 27).toString('hex')
  return ret;
}

function getLimitOrderSig(account,nonce,srcToken,srcQty,destToken,destAddress,minConversionRate,feeInPrecision) {
  msgHash = Sha3(account.address,nonce,srcToken,srcQty,destToken,destAddress,minConversionRate,feeInPrecision);
  ret = ecsign(msgHash,account.privateKey);
  return ret;
}

module.exports.getConcatenatedTokenAddresses = function(srcToken,destToken) {
  //obtain only 16 bytes of srcToken and destToken
  srcToken = srcToken.substring(0,34).toLowerCase();
  destToken = destToken.substring(2,34).toLowerCase(); //remove 0x prefix
  concatenatedAddresses = srcToken + destToken;
  return new BN(concatenatedAddresses);
}

module.exports.getNonce = function(address,timestamp=Date.now()) {
  currentTimestamp = web3.toHex(timestamp);
  //remove 0x prefix
  currentTimestamp = currentTimestamp.substring(2);
	currentTimestamp = leftPadWithZeroes(currentTimestamp);
	//first 16 bytes = 32 char length + 0x prefix of length 2 = 34
	return address.substring(0,34) + currentTimestamp;
}

function leftPadWithZeroes(timeStampInHex) {
	return '0'.repeat(32 - timeStampInHex.length)+timeStampInHex;
}

//addPrefix: by default, won't add as it'll automatically be added in smart contract for verification
module.exports.getLimitOrderSignature = function(account,nonce,srcToken,srcQty,destToken,destAddress,minConversionRate,feeInPrecision) {
  srcQty = new BN(srcQty);
  minConversionRate = new BN(minConversionRate);
  feeInPrecision = new BN(feeInPrecision);
  return getLimitOrderSig(account,nonce,srcToken,srcQty,destToken,destAddress,minConversionRate,feeInPrecision);
}
