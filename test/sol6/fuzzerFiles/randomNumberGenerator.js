const BN = web3.utils.BN;
module.exports.genRandomSeed = genRandomSeed;
function genRandomSeed(base) {
    return Math.floor(Math.random() * base) % base;
}

module.exports.genRandomBN = function(minBN, maxBN) {
    let seed = new BN(genRandomSeed(1000000000000000));
    // normalise seed
    return (maxBN.sub(minBN).mul(seed).div(new BN(1000000000000000))).add(minBN);
}
