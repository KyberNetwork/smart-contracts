const artifacts = require('@nomiclabs/buidler').artifacts

const KyberReserveHighRate = artifacts.require('KyberReserveHighRate.sol')
const ConversionRateEnhancedSteps = artifacts.require(
  'ConversionRateEnhancedSteps.sol'
)
const WrapConversionRateEnhancedSteps = artifacts.require(
  'WrapConversionRateEnhancedSteps.sol'
)

const Web3 = require('web3')
const fs = require('fs')
const RLP = require('rlp')
const { fromUtf8 } = require('web3-utils')
const BN = Web3.utils.BN

const {
  gasPriceGwei,
  rpcUrl,
  chainId: chainIdInput,
  privateKey
} = require('yargs')
  .usage(
    'Usage: PRIVATE_KEY=xxxx $0 --gas-price-gwei [gwei] --rpc-url [url] --chain-id'
  )
  .demandOption(['gasPriceGwei', 'rpcUrl', 'privateKey'])
  .env(true)
  .boolean('dontSendTx').argv

console.log(rpcUrl)

let web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl))

let reserve
let reserveAddr //= "0xc4b5C2B1d8922B324024A8e7CA1216d1460376Bd"
let conversionRate
let conversionRateAddr // = "0x80a932DFd1DA618d1f6d446CC676F68Aac1b9f6C"
let wrapper
let wrapperAddr //= "0xc3Caa675F718E84e05EA0Da649987d3AafE17b96"

let networkAddr = '0x9cb7bb6d4795a281860b9bfb7b1441361cc9a794'
let admin = '0xf3D872b9E8d314820dc8E99DAfBe1A3FeEDc27D5'
// let deployer

const account = web3.eth.accounts.privateKeyToAccount(privateKey)
const sender = account.address
const gasPrice = new BN(gasPriceGwei).mul(new BN(10).pow(new BN(9)))
const signedTxs = []
let nonce
let chainId = chainIdInput

process.on('unhandledRejection', console.error.bind(console))

console.log('from', sender)

async function sendTx (txObject, gasLimit) {
  const txTo = txObject._parent.options.address

  try {
    gasLimit = gasLimit == undefined ? await txObject.estimateGas() : gasLimit
    gasLimit = Math.round(1.1 * gasLimit)
  } catch (e) {
    gasLimit = 800000
  }

  if (txTo !== null) {
    gasLimit = 800000
  }

  const txData = txObject.encodeABI()
  const txFrom = account.address
  const txKey = account.privateKey

  const tx = {
    from: txFrom,
    to: txTo,
    nonce: nonce,
    data: txData,
    gas: gasLimit,
    chainId,
    gasPrice
  }

  const signedTx = await web3.eth.accounts.signTransaction(tx, txKey)
  nonce++
  // don't wait for confirmation
  signedTxs.push(signedTx.rawTransaction)
  web3.eth.sendSignedTransaction(signedTx.rawTransaction, {
    from: sender
  })
}

async function deployContract (contract, ctorArgs) {
  const bytecode = contract.bytecode
  const abi = contract.abi
  const myContract = new web3.eth.Contract(abi)

  const deploy = myContract.deploy({ data: bytecode, arguments: ctorArgs })
  let address =
    '0x' +
    web3.utils
      .sha3(RLP.encode([sender, nonce]))
      .slice(12)
      .substring(14)
  address = web3.utils.toChecksumAddress(address)

  await sendTx(deploy, 6500000)

  myContract.options.address = address

  return [address, myContract]
}

const keypress = async () => {
  process.stdin.setRawMode(true)
  return new Promise(resolve =>
    process.stdin.once('data', data => {
      const byteArray = [...data]
      if (byteArray.length > 0 && byteArray[0] === 3) {
        console.log('^C')
        process.exit(1)
      }
      process.stdin.setRawMode(false)
      resolve()
    })
  )
}

async function main () {
  nonce = await web3.eth.getTransactionCount(sender)
  console.log('nonce', nonce)
  chainId = chainId || (await web3.eth.net.getId())
  console.log('chainId', chainId)

  web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl))

  if (conversionRateAddr == undefined) {
    [conversionRateAddr, conversionRate] = await deployContract(
      ConversionRateEnhancedSteps,
      [sender]
    )
    console.log(`deploy conversionRate at ${conversionRateAddr}`)
  } else {
    conversionRate = new web3.eth.Contract(
      ConversionRateEnhancedSteps.abi,
      conversionRateAddr
    )
  }

  if (reserveAddr == undefined) {
    [reserveAddr, reserve] = await deployContract(KyberReserveHighRate, [
      networkAddr,
      conversionRateAddr,
      sender
    ])
    console.log(`deploy reserve at ${reserveAddr}`)
  } else {
    reserve = new web3.eth.Contract(KyberReserveHighRate.abi, reserveAddr)
  }

  if (wrapperAddr == undefined) {
    [wrapperAddr, wrapper] = await deployContract(
      WrapConversionRateEnhancedSteps,
      [conversionRateAddr]
    )
    console.log(`deploy wrapper at ${wrapperAddr}`)
  } else {
    wrapper = new web3.eth.Contract(
      WrapConversionRateEnhancedSteps.abi,
      wrapperAddr
    )
  }

  console.log(`set conversionRate admin to wrapper contract`)
  await sendTx(conversionRate.methods.setReserveAddress(reserveAddr))
  await sendTx(conversionRate.methods.transferAdmin(wrapperAddr))
  await sendTx(wrapper.methods.claimWrappedContractAdmin())

  console.log(`set admin to new admin`)
  await sendTx(wrapper.methods.transferAdminQuickly(admin))
  await sendTx(reserve.methods.transferAdminQuickly(admin))

  await keypress()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
