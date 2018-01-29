let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let Reserve = artifacts.require("./KyberReserve.sol");
let Network = artifacts.require("./KyberNetwork.sol");
let Wrapper = artifacts.require("./mockContracts/Wrapper.sol");
let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
//////////////////
let precisionUnits = (new BigNumber(10).pow(18));
let ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';


//addresses
let admin;

//contracts
let wrapper;
let network;
let reserve;

contract('Wrapper', function(accounts) {
    it("should init globals. init 2 ConversionRates Inst, init tokens and add to pricing inst. set basic data per token.", async function () {
        // set account addresses
        admin = accounts[0];
        reserve = accounts[1];

        wrapper = await Wrapper.new();
        network = await Network.new(admin);
        let token1 = await TestToken.new("testing", "tst", 18);
        let token2 = await TestToken.new("testing2", "tst2", 18);

        await network.listPairForReserve(reserve, token1.address, ethAddress, true);

        let isListed = await wrapper.isTokenListedOnNetwork(network.address, reserve, token1.address, ethAddress);

        console.log(isListed);
        assert.equal(isListed[0], true);
        assert.equal(isListed[1], false);


        await network.listPairForReserve(reserve, ethAddress, token1.address, true);

        isListed = await wrapper.isTokenListedOnNetwork(network.address, reserve, token1.address, ethAddress);

        console.log(isListed);
        assert.equal(isListed[0], true);
        assert.equal(isListed[1], true);
    });
});