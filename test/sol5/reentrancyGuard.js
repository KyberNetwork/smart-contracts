let ReentrancyMock = artifacts.require('./mockContracts/ReentrancyMock.sol');
let ReentrancyAttack = artifacts.require('./mockContracts/ReentrancyAttack.sol');

const { expectRevert } = require('@openzeppelin/test-helpers');

contract('ReentrancyGuard', function(accounts) {
    let reentrancyMock;
    
    beforeEach(async function() {
        reentrancyMock = await ReentrancyMock.new();
        let initialCounter = await reentrancyMock.counter.call();
        assert.equal(initialCounter.valueOf(), 0, "counter not zero");
    });

    it('should not allow remote callback', async function() {
        let attacker = await ReentrancyAttack.new();
        await expectRevert(
            reentrancyMock.countAndCall(attacker.address),
            "Function reentrance occured"
        );
    });
  
    it('should not allow local recursion', async function() {
        await expectRevert(
            reentrancyMock.countLocalRecursive(10),
            "Function reentrance occured"
        );
    });

  it('should not allow indirect local recursion', async function() {
      await expectRevert(
          reentrancyMock.countThisRecursive(10),
          "ReentrancyMock: failed call"
      );
  });
});
