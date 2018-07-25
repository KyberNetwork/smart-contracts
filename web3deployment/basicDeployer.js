#!/usr/bin/env node

const Web3 = require("web3");
const fs = require("fs");
const path = require('path');
const RLP = require('rlp');
const BigNumber = require('bignumber.js')

process.on('unhandledRejection', console.error.bind(console))

const { gasPriceGwei, printPrivateKey, rpcUrl, signedTxOutput, dontSendTx, chainId: chainIdInput } = require('yargs')
    .usage('Usage: $0 --gas-price-gwei [gwei] --print-private-key [bool] --rpc-url [url] --signed-tx-output [path] --dont-send-tx [bool] --chain-id')
    .demandOption(['gasPriceGwei', 'rpcUrl'])
    .boolean('printPrivateKey')
    .boolean('dontSendTx')
    .argv;
const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
const solc = require('solc')

const rand = web3.utils.randomHex(7);

const privateKey = web3.utils.sha3("in joy we trust" + rand);
console.log("privateKey", privateKey);

if (printPrivateKey) {
  let path = "privatekey_"  + web3.utils.randomHex(7) + ".txt";
  fs.writeFileSync(path, privateKey, function(err) {
      if(err) {
          return console.log(err);
      }
  });
}
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
const sender = account.address;
const gasPrice = BigNumber(gasPriceGwei).mul(10 ** 9);
const signedTxs = [];
let nonce;
let chainId = chainIdInput;

console.log("from",sender);

async function sendTx(txObject) {
  const txTo = txObject._parent.options.address;

  let gasLimit;
  try {
    gasLimit = await txObject.estimateGas();
  }
  catch (e) {
    gasLimit = 500 * 1000;
  }

  if(txTo !== null) {
    gasLimit = 500 * 1000;
  }

    gasLimit *= 1.2;
    gasLimit -= gas Limit % 1;

  //console.log(gasLimit);
  const txData = txObject.encodeABI();
  const txFrom = account.address;
  const txKey = account.privateKey;

  const tx = {
    from : txFrom,
    to : txTo,
    nonce : nonce,
    data : txData,
    gas : gasLimit,
    chainId,
    gasPrice
  };

  const signedTx = await web3.eth.accounts.signTransaction(tx, txKey);
  nonce++;
  // don't wait for confirmation
  signedTxs.push(signedTx.rawTransaction)
  if (!dontSendTx) {
    web3.eth.sendSignedTransaction(signedTx.rawTransaction, {from:sender});
  }
}

async function deployContract(solcOutput, contractName, ctorArgs) {

    const actualName = contractName;
    const bytecode = solcOutput.contracts[actualName].bytecode;

    const abi = solcOutput.contracts[actualName].interface;
    const myContract = new web3.eth.Contract(JSON.parse(abi));
    const deploy = myContract.deploy({data:"0x" + bytecode, arguments: ctorArgs});
    let address = "0x" + web3.utils.sha3(RLP.encode([sender,nonce])).slice(12).substring(14);
    address = web3.utils.toChecksumAddress(address);

    await sendTx(deploy);

    myContract.options.address = address;


    return [address,myContract];
}

const contractPath = path.join(__dirname, "../contracts/");


const input = {
  "PermissionGroups.sol" : fs.readFileSync(contractPath + 'PermissionGroups.sol', 'utf8'),
  "ERC20Interface.sol" : fs.readFileSync(contractPath + 'ERC20Interface.sol', 'utf8'),
  "Withdrawable.sol" : fs.readFileSync(contractPath + 'Withdrawable.sol', 'utf8'),
  "Utils.sol" : fs.readFileSync(contractPath + 'Utils.sol', 'utf8'),
  "Utils2.sol" : fs.readFileSync(contractPath + 'Utils2.sol', 'utf8'),
//  "ConversionRatesInterface.sol" : fs.readFileSync(contractPath + 'ConversionRatesInterface.sol', 'utf8'),
//  "ConversionRates.sol" : fs.readFileSync(contractPath + 'ConversionRates.sol', 'utf8'),
//  "SanityRatesInterface.sol" : fs.readFileSync(contractPath + 'SanityRatesInterface.sol', 'utf8'),
//  "ExpectedRateInterface.sol" : fs.readFileSync(contractPath + 'ExpectedRateInterface.sol', 'utf8'),
//  "SanityRates.sol" : fs.readFileSync(contractPath + 'SanityRates.sol', 'utf8'),
//  "ExpectedRate.sol" : fs.readFileSync(contractPath + 'ExpectedRate.sol', 'utf8'),
//  "VolumeImbalanceRecorder.sol" : fs.readFileSync(contractPath + 'VolumeImbalanceRecorder.sol', 'utf8'),
  "FeeBurnerInterface.sol" : fs.readFileSync(contractPath + 'FeeBurnerInterface.sol', 'utf8'),
  "FeeBurner.sol" : fs.readFileSync(contractPath + 'FeeBurner.sol', 'utf8'),
//  "WhiteListInterface.sol" : fs.readFileSync(contractPath + 'WhiteListInterface.sol', 'utf8'),
//  "WhiteList.sol" : fs.readFileSync(contractPath + 'WhiteList.sol', 'utf8'),
//  "KyberReserveInterface.sol" : fs.readFileSync(contractPath + 'KyberReserveInterface.sol', 'utf8'),
//  "KyberNetwork.sol" : fs.readFileSync(contractPath + 'KyberNetwork.sol', 'utf8'),
//  "KyberReserve.sol" : fs.readFileSync(contractPath + 'KyberReserve.sol', 'utf8'),
//  "Wrapper.sol" : fs.readFileSync(contractPath + 'mockContracts/Wrapper.sol', 'utf8')
  "WrapperBase.sol" : fs.readFileSync(contractPath + 'wrapperContracts/WrapperBase.sol', 'utf8'),
  "WrapFeeBurner.sol" : fs.readFileSync(contractPath + 'wrapperContracts/WrapFeeBurner.sol', 'utf8'),
  "FeeBurnerWrapperProxy.sol" : fs.readFileSync(contractPath + 'wrapperContracts/FeeBurnerWrapperProxy.sol', 'utf8'),
  "KyberRegisterWallet.sol" : fs.readFileSync(contractPath + 'wrapperContracts/KyberRegisterWallet.sol', 'utf8')
};


const ethAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const feeBurnerAddress = '0xd6703974Dc30155d768c058189A2936Cf7C62Da6'; //staging
//const feeBurnerAddress = '0xed4f53268bfdff39b36e8786247ba3a02cf34b04';  //production

async function main() {
    nonce = await web3.eth.getTransactionCount(sender);
    console.log("nonce",nonce);

    chainId = chainId || await web3.eth.net.getId()
    console.log('chainId', chainId);

    console.log("starting compilation");
    const output = await solc.compile({ sources: input }, 1);
    console.log(output.errors);
    console.log("finished compilation");

    if (!dontSendTx) {
        await waitForEth();
    }


    let wrapperFeeBurnerAddress;
    let wrapFeeBurnerContract;

    [wrapperFeeBurnerAddress, wrapFeeBurnerContract] =
        await deployContract(output, "WrapFeeBurner.sol:WrapFeeBurner", [feeBurnerAddress, sender]);

    console.log("wrap fee burner address: " + wrapperFeeBurnerAddress);

    let feeBurnerWrapperProxyAddress;
    let feeBurnerWrapperProxyContract;

    [feeBurnerWrapperProxyAddress, feeBurnerWrapperProxyContract] =
        await deployContract(output, "FeeBurnerWrapperProxy.sol:FeeBurnerWrapperProxy", [wrapperFeeBurnerAddress]);

    console.log('feeBurnerWrapperProxyAddress')
    console.log(feeBurnerWrapperProxyAddress)

    let registerWalletAddress;
    let registerWalletContract;

    [registerWalletAddress, registerWalletContract] =
        await deployContract(output, "KyberRegisterWallet.sol:KyberRegisterWallet", [feeBurnerWrapperProxyAddress]);

    console.log('registerWalletAddress')
    console.log(registerWalletAddress)
//    console.log("fee burner wrapper");
//    let wrapperFeeBurnerAddress = '0xBe401c3cf8528DB1B963e2E40827a2E0e1d98Ee4';
//    let abi = output.contracts["WrapFeeBurner.sol:WrapFeeBurner"].interface;
//    wrapFeeBurnerContract = await new web3.eth.Contract(JSON.parse(abi), wrapperFeeBurnerAddress);


//    await sendTx(wrapFeeBurnerContract.methods.addOperator(anotherAdd));
    await sendTx(wrapFeeBurnerContract.methods.addOperator(someAdd));
    await sendTx(wrapFeeBurnerContract.methods.transferAdminQuickly(someAdd));
    await sendTx(feeBurnerWrapperProxyContract.methods.transferAdminQuickly(someAdd));

    console.log("last nonce is", nonce);
}

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

async function waitForEth() {
  while(true) {
    const balance = await web3.eth.getBalance(sender);
    console.log("waiting for balance to account " + sender);
    if(balance.toString() !== "0") {
      console.log("received " + balance.toString() + " wei");
      return;
    }
    else await sleep(10000)
  }
}

main();

//console.log(deployContract(output, "cont",5));