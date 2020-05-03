const ReentrancyMock = artifacts.require('./mockContracts/ReentrancyMock.sol');
const ReentrancyAttack = artifacts.require('./mockContracts/ReentrancyAttack.sol');

const { expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');


contract('ReentrancyGuard', function(accounts) {
    beforeEach(async function () {
        this.reentrancyMock = await ReentrancyMock.new();
        expect(await this.reentrancyMock.counter()).to.be.bignumber.equal('0');
    });

    it('should not allow remote callback', async function () {
        const attacker = await ReentrancyAttack.new();
        await expectRevert(
            this.reentrancyMock.countAndCall(attacker.address), 'ReentrancyAttack: failed call');
    });

    // The following are more side-effects than intended behavior:
    // I put them here as documentation, and to monitor any changes
    // in the side-effects.

    it('should not allow local recursion', async function () {
        await expectRevert(
          this.reentrancyMock.countLocalRecursive(10), 'ReentrancyGuard: reentrant call'
        );
    });

    it('should not allow indirect local recursion', async function () {
        await expectRevert(
          this.reentrancyMock.countThisRecursive(10), 'ReentrancyMock: failed call'
        );
    });
});
