const BN = web3.utils.BN
const BASE = 100 // base for weighted operations

function genRandomNumber (base) {
  return Math.floor(Math.random() * base)
}

function genRandomSeed (length, base) {
  return web3.utils.randomHex(length) % base
}

function genRandomBN (minBN, maxBN) {
  let seed = new BN(genRandomNumber(1000000000000000))
  // normalise seed
  return maxBN
    .sub(minBN)
    .mul(seed)
    .div(new BN(1000000000000000))
    .add(minBN)
}

module.exports = {BASE, genRandomNumber, genRandomBN}
