#!/usr/bin/env node

const Web3 = require("web3");
const fs = require("fs");

process.on('unhandledRejection', console.error.bind(console))

const { rpcUrl, signedTxsInput } = require('yargs')
    .usage('Usage: $0 --rpc-url [url] --signed-tx-input [path]')
    .demandOption(['rpcUrl', 'signedTxsInput'])
    .argv;

const { from, txs } = JSON.parse(fs.readFileSync(signedTxsInput))

const provider = new Web3.providers.HttpProvider(rpcUrl)
const web3 = new Web3(provider)

async function main () {
  console.log('from', from, 'number of txs', txs.length);
  await waitForEth(from)

  const res = await Promise.all(txs.map((tx, i) => {
    const payload = {
      jsonrpc: '2.0',
      method: 'eth_sendRawTransaction',
      id: i,
      params: [ tx ]
    }
    return new Promise((resolve, reject) => {
      return provider.send(payload, function (err, result) {
        return err ? reject(err) : resolve({ transactionHash: result.result })
      })
    })
  }))
  console.log(JSON.stringify(res, null, 2));
}

async function waitForEth(sender) {
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
function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

main();
