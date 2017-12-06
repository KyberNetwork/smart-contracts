var MockDepositAddress = artifacts.require("./MockDepositAddress.sol");
var MockExchange = artifacts.require("./MockExchange.sol");
var MockCenteralBank = artifacts.require("./MockCenteralBank.sol");
var ERC20Interface = artifacts.require("./ERC20.sol");
var TestToken = artifacts.require("./TestToken.sol");

module.exports = async function (deployer, network, accounts) {
    var tokenNames = ["first", "second", "third", "fourth"];
    var tokenSymbols = ["frs", "sec", "thr", "for"]

    deployer.deploy(TestToken, tokenNames[0], tokenSymbols[0], 18).then( async function () {
        let token1 = await TestToken.deployed();
        let [token2, token3] = await Promise.all([TestToken.new(tokenNames[1], tokenSymbols[1], 18),
                                                 TestToken.new(tokenNames[2], tokenSymbols[2], 18)]);

        await deployer.deploy(MockCenteralBank);
        let [bank, supply] = await Promise.all([MockCenteralBank.deployed(), token1.INITIAL_SUPPLY()])

        /* initial supply should be transferred to bank */
        await Promise.all([token1.transfer(bank.address, supply),
                           token2.transfer(bank.address, supply) ,
                           token3.transfer(bank.address, supply)]);
        let balance = await token1.balanceOf(bank.address);

        /* now mock deposit address and mock exchange */
        /**********************************************/
        await deployer.link(MockCenteralBank, [MockDepositAddress, MockExchange]);

        await deployer.deploy(MockExchange, "exchange", bank.address);
        let exchange = await MockExchange.deployed();

        await Promise.all([exchange.addMockDepositAddress(token1.address),
                           exchange.addMockDepositAddress(token2.address),
                           exchange.addMockDepositAddress(token3.address)]);

//        await sendEtherWithPromise (accounts[0], bank.address, 5);
    });

    console.log("added all mock deposit to mock exchange");
};


//var sendEtherWithPromise = function( sender, recv, amount ) {
//    return new Promise(function(fulfill, reject){
//            web3.eth.sendTransaction({to: recv, from: sender, value: amount}, function(error, result){
//            if( error ) {
//                return reject(error);
//            }
//            else {
//                return fulfill(true);
//            }
//        });
//    });
//};