var Web3 = require("web3");
var fs = require("fs");
var RLP = require('rlp');
var mainnetGasPrice = 17 * 10**9;
var kovanGasPrice = 50 * 10 ** 9;

var mainnet = false;

if (mainnet) {
  url = "https://mainnet.infura.io";
}
else {
  //url = "http://localhost:8545";
  url = "https://kovan.infura.io";
}


var web3 = new Web3(new Web3.providers.HttpProvider(url));
var solc = require('solc')

var rand = web3.utils.randomHex(999);
var privateKey = web3.utils.sha3("js sucks" + rand);
var account = web3.eth.accounts.privateKeyToAccount(privateKey);
var sender = account.address;
var nonce;

console.log("from",sender);

async function sendTx(txObject) {
  var txTo = txObject._parent.options.address;

  var gasLimit;
  try {
    gasLimit = await txObject.estimateGas();
  }
  catch (e) {
    gasLimit = 500 * 1000;
  }

  if(txTo !== null) {
    gasLimit = 500 * 1000;
  }

  //console.log(gasLimit);
  var txData = txObject.encodeABI();
  var txFrom = account.address;
  var txKey = account.privateKey;

  var tx = {
    from : txFrom,
    to : txTo,
    nonce : nonce,
    data : txData,
    gas : gasLimit,
    gasPrice : mainnet ? mainnetGasPrice : kovanGasPrice
  };

  var signedTx = await web3.eth.accounts.signTransaction(tx, txKey);
  nonce++;
  // don't wait for confirmation
  web3.eth.sendSignedTransaction(signedTx.rawTransaction,{from:sender});
}

async function deployContract(solcOutput, contractName, ctorArgs) {

  var actualName = contractName;
  var bytecode = solcOutput.contracts[actualName].bytecode;

  var abi = solcOutput.contracts[actualName].interface;
  var myContract = new web3.eth.Contract(JSON.parse(abi));
  var deploy = myContract.deploy({data:"0x" + bytecode, arguments: ctorArgs});
  var address = "0x" + web3.utils.sha3(RLP.encode([sender,nonce])).slice(12).substring(14);
  address = web3.utils.toChecksumAddress(address);

  await sendTx(deploy);

  myContract.options.address = address;


  return [address,myContract];



}

const contractPath = "../contracts/";

var input = {
  "UpdateConvRate.sol" : fs.readFileSync(contractPath + 'mockContracts/UpdateConvRate.sol', 'utf8')
};

async function main() {
  nonce = await web3.eth.getTransactionCount(sender);
  console.log("nonce",nonce);

  console.log("starting compilation");
  var output = await solc.compile({ sources: input }, 1);
  //console.log(output);
  console.log("finished compilation");

  await waitForEth();

  var conversionRate = "0x798AbDA6Cc246D0EDbA912092A2a3dBd3d11191B";

  var addr;
  var contract;

 [addr,contract] = await deployContract(output, "UpdateConvRate.sol:UpdateConvRate",
        [conversionRate]);

  console.log("address", addr);
  console.log("last nonce is", nonce);

  console.log("private key")
  console.log(privateKey);

}


function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

async function waitForEth() {
  while(true) {
    var balance = await web3.eth.getBalance(sender);
    console.log("waiting for balance to account " + sender);
    if(balance.toString() !== "0") {
      console.log("received " + balance.toString() + " wei");
      return;
    }
    else await sleep(10000)
  }
}



main();
