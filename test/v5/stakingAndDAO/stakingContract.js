const TestToken = artifacts.require("Token.sol");
const MockKyberDAO = artifacts.require("MockKyberDAO.sol");
const StakingContract = artifacts.require("MockStakingContract.sol");
const Helper = require("../../v4/helper.js");

const BN = web3.utils.BN;

const precision = (new BN(10).pow(new BN(18)));
const zeroAddress = '0x0000000000000000000000000000000000000000';

let admin;

let currentBlock;

let epochPeriod = 20;
let startBlock;
let kncToken;
let stakingContract;
let victor;
let loi;
let mike;

contract('StakingContract', function(accounts) {
    before("one time init", async() => {
        admin = accounts[1];
        kncToken = await TestToken.new("Kyber Network Crystal", "KNC", 18);
        victor = accounts[2];
        loi = accounts[3];
        mike = accounts[4];
    });

    beforeEach("running before each test", async() => {
        currentBlock = await Helper.getCurrentBlock();
    });

    const deployStakingContract = async(_epochPeriod, _startBlock) => {
        epochPeriod = _epochPeriod;
        startBlock = _startBlock;
        stakingContract = await StakingContract.new(kncToken.address, epochPeriod, startBlock, admin);
    };

    it("Test setting DAO address and verify inited data", async function() {
        await deployStakingContract(10, currentBlock + 10);

        assert.equal(admin, await stakingContract.admin(), "admin address is wrong");
        assert.equal(kncToken.address, await stakingContract.KNC_TOKEN(), "admin address is wrong");
        assert.equal(zeroAddress, await stakingContract.DAO(), "admin address is wrong");
        assert.equal(epochPeriod, await stakingContract.EPOCH_PERIOD(), "admin address is wrong");
        assert.equal(startBlock, await stakingContract.START_BLOCK(), "admin address is wrong");

        let daoContract = await MockKyberDAO.new();

        await stakingContract.updateDAOAddressAndRemoveAdmin(daoContract.address, {from: admin});

        assert.equal(zeroAddress, await stakingContract.admin(), "admin address is wrong");
        assert.equal(daoContract.address, await stakingContract.DAO(), "admin address is wrong");
    });

    it("Test get epoch number returns correct data", async function() {
        await deployStakingContract(10, currentBlock + 10);

        let currentEpoch = 0;
        Helper.assertEqual(currentEpoch, await stakingContract.getCurrentEpochNumber(), "wrong epoch number");

        currentEpoch = 1;
        // delay until first block of epoch 1
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[1], startBlock - currentBlock);

        currentBlock = await Helper.getCurrentBlock();
        Helper.assertEqual(currentEpoch, await stakingContract.getCurrentEpochNumber(), "wrong epoch number");
        Helper.assertEqual(currentEpoch, await stakingContract.getEpochNumber(currentBlock), "wrong epoch number");
        Helper.assertEqual(
            await stakingContract.getCurrentEpochNumber(),
            await stakingContract.getEpochNumber(currentBlock),
            "wrong epoch number from contract"
        );

        currentBlock = await Helper.getCurrentBlock();
        // delay until last block of epoch 1
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock - 1);
        Helper.assertEqual(currentEpoch, await stakingContract.getCurrentEpochNumber(), "wrong epoch number");

        currentEpoch = 10;
        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], (currentEpoch - 2) * epochPeriod + 3);
        currentBlock = await Helper.getCurrentBlock();
        Helper.assertEqual(currentEpoch, await stakingContract.getEpochNumber(currentBlock), "wrong epoch number");
        Helper.assertEqual(currentEpoch, await stakingContract.getCurrentEpochNumber(), "wrong epoch number");
    });

    it("Test get latest delegated address return correct data when not inited", async function() {
        await deployStakingContract(10, currentBlock + 10);

        currentBlock = await Helper.getCurrentBlock();
        await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

        Helper.assertEqual(victor, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is wrong");
        Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(mike), "latest delegated address is wrong");
        Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(loi), "latest delegated address is wrong");

        await stakingContract.delegate(mike, {from: victor});
        await stakingContract.delegate(loi, {from: mike});

        Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is wrong");
        Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(mike), "latest delegated address is wrong");
        Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(loi), "latest delegated address is wrong");
    });

    describe("#Deposit Tests", () => {
        it("Test deposit at beginning of epoch, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: victor});

            Helper.assertEqual(0, await stakingContract.getStakes(victor, 0), "stake at epoch 0 is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // delay to start of epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock - 1);
            await stakingContract.deposit(precision.mul(new BN(20)), {from: victor});

            Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(20)), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // delay to start of epoch 4
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock - 1);
            await stakingContract.deposit(precision.mul(new BN(30)), {from: victor});

            assert.equal(false, await stakingContract.getHasInitedValue(victor, 3), "shouldn't init value at epoch 3");
            Helper.assertEqual(precision.mul(new BN(20)), await stakingContract.getStakes(victor, 3), "stake at epoch 3 is wrong");

            Helper.assertEqual(precision.mul(new BN(20)), await stakingContract.getStakesValue(victor, 4), "stake at epoch 4 is wrong");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getStakesValue(victor, 5), "stake at epoch 5 is wrong");
        });

        it("Test deposit at end of epoch, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: victor});

            Helper.assertEqual(0, await stakingContract.getStakes(victor, 0), "stake at epoch 0 is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            await stakingContract.deposit(precision.mul(new BN(10)), {from: victor});
    
            Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 0), "stake at epoch 0 is wrong");
            Helper.assertEqual(precision.mul(new BN(10)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 2), "shouldn't init value at epoch 2");
            Helper.assertEqual(precision.mul(new BN(10)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // delay to end of epoch 0
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock - 2);
            await stakingContract.deposit(precision.mul(new BN(20)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(30)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 2), "shouldn't init value at epoch 2");
            assert.equal(false, await stakingContract.getHasInitedValue(victor, 2), "shouldn't init value at epoch 2");
            Helper.assertEqual(precision.mul(new BN(30)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // delay to end of epoch 2
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2 * epochPeriod + startBlock - currentBlock - 2);
            await stakingContract.deposit(precision.mul(new BN(20)), {from: victor});

            assert.equal(true, await stakingContract.getHasInitedValue(victor, 2), "shouldn't init value at epoch 2");
            Helper.assertEqual(precision.mul(new BN(30)), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getStakesValue(victor, 3), "should have inited value at epoch 3");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
        });

        it("Test deposit then withdraw at same + different epoch, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, precision.mul(new BN(200)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(200)), {from: victor});

            // deposit at epoch 0
            await stakingContract.deposit(precision.mul(new BN(50)), {from: victor});
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);
            // deposit at epoch 1
            await stakingContract.deposit(precision.mul(new BN(60)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(110)), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(precision.mul(new BN(110)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            await stakingContract.withdraw(precision.mul(new BN(20)), {from: victor});
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(90)), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(precision.mul(new BN(90)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // delay few epochs
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod * 6 + startBlock - currentBlock + 1);

            await stakingContract.withdraw(precision.mul(new BN(30)), {from: victor});
            Helper.assertEqual(precision.mul(new BN(90)), await stakingContract.getStakes(victor, 6), "stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(60)), await stakingContract.getStakesValue(victor, 7), "stake at epoch 2 is wrong");
            Helper.assertEqual(precision.mul(new BN(60)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
        });

        it("Test deposit then withdraw + deposit again at same epoch, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, precision.mul(new BN(200)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(200)), {from: victor});

            // deposit at epoch 0
            await stakingContract.deposit(precision.mul(new BN(50)), {from: victor});
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.withdraw(precision.mul(new BN(20)), {from: victor});
            Helper.assertEqual(precision.mul(new BN(30)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(30)), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(precision.mul(new BN(30)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            await stakingContract.deposit(precision.mul(new BN(50)), {from: victor});
            Helper.assertEqual(precision.mul(new BN(30)), await stakingContract.getStakes(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(80)), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(precision.mul(new BN(80)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
        });

        it("Test deposit after full withdraw, stakes change as expected - no delegation", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, precision.mul(new BN(200)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(200)), {from: victor});

            // deposit at epoch 0
            await stakingContract.deposit(precision.mul(new BN(50)), {from: victor});
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            await stakingContract.withdraw(precision.mul(new BN(50)), {from: victor});
            Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            await stakingContract.deposit(precision.mul(new BN(50)), {from: victor});
            Helper.assertEqual(0, await stakingContract.getStakes(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod);
            await stakingContract.deposit(precision.mul(new BN(20)), {from: victor});
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getStakes(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(precision.mul(new BN(70)), await stakingContract.getStakesValue(victor, 3), "stake at epoch 3 is wrong");
            Helper.assertEqual(precision.mul(new BN(70)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
        });

        it("Test deposit after full withdraw, stakes change as expected - with delegation", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, precision.mul(new BN(200)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(200)), {from: victor});

            // deposit at epoch 0
            await stakingContract.deposit(precision.mul(new BN(50)), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getDelegatedStakes(mike, 1), "delegated stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance is wrong");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.withdraw(precision.mul(new BN(50)), {from: victor});
            Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakes(mike, 1), "delegated stake at epoch 1 is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance is wrong");

            await stakingContract.deposit(precision.mul(new BN(40)), {from: victor});
            Helper.assertEqual(0, await stakingContract.getStakes(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(40)), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(precision.mul(new BN(40)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
            Helper.assertEqual(precision.mul(new BN(40)), await stakingContract.getDelegatedStakes(mike, 2), "delegated stake at epoch 2 is wrong");
            Helper.assertEqual(precision.mul(new BN(40)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod);
            await stakingContract.deposit(precision.mul(new BN(20)), {from: victor});
            Helper.assertEqual(precision.mul(new BN(40)), await stakingContract.getStakes(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(precision.mul(new BN(60)), await stakingContract.getStakesValue(victor, 3), "stake at epoch 3 is wrong");
            Helper.assertEqual(precision.mul(new BN(60)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
            Helper.assertEqual(precision.mul(new BN(40)), await stakingContract.getDelegatedStakes(mike, 2), "delegated stake at epoch 2 is wrong");
            Helper.assertEqual(precision.mul(new BN(60)), await stakingContract.getDelegatedStakes(mike, 3), "delegated stake at epoch 3 is wrong");
            Helper.assertEqual(precision.mul(new BN(60)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance is wrong");
        });

        it("Test deposit few consecutive epochs + after few epochs, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, precision.mul(new BN(1000)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(1000)), {from: victor});

            let currentEpoch = 0;
            let totalDeposited = 0;

            for(let id = 0; id < 10; id++) {
                await stakingContract.deposit(precision.mul(new BN(id * 2 + 1)), {from: victor});
                totalDeposited += id * 2 + 1;
                Helper.assertEqual(precision.mul(new BN(totalDeposited - id * 2 - 1)), await stakingContract.getStakesValue(victor, currentEpoch), "stake at cur epoch is wrong, loop: " + id);
                Helper.assertEqual(precision.mul(new BN(totalDeposited)), await stakingContract.getStakesValue(victor, currentEpoch + 1), "stake at next epoch is wrong, loop: " + id);
                Helper.assertEqual(precision.mul(new BN(totalDeposited)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong, loop: " + id);
                currentEpoch++;
                await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            }

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
            Helper.assertEqual(precision.mul(new BN(totalDeposited)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
            Helper.assertEqual(precision.mul(new BN(totalDeposited)), await stakingContract.getStakes(victor, currentEpoch + 3), "stake is wrong");
        });

        it("Test deposit then delegate, then deposit again, stakes changes as expected", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(1000)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(1000)), {from: victor});

            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 0), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated addres is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");

            await stakingContract.deposit(precision.mul(new BN(20)), {from: victor});
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 0), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(120)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(120)), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");

            // delay to next epoch
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            await stakingContract.deposit(precision.mul(new BN(30)), {from: victor});
            Helper.assertEqual(precision.mul(new BN(120)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(150)), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(150)), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 2), "delegated addres is wrong");

            // delay few epochs
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
            await stakingContract.deposit(precision.mul(new BN(50)), {from: victor});
            Helper.assertEqual(precision.mul(new BN(150)), await stakingContract.getDelegatedStakes(mike, 5), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 6), "delegated addres is wrong");
        });

        it("Test deposit then delegate, then delegate again at same + different epoch", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(1000)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(1000)), {from: victor});

            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 0), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated addres is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");

            await stakingContract.delegate(loi, {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated addres is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 2), "delegated addres is wrong");

            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated addres is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(loi), "delegated stake is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
            await stakingContract.delegate(loi, {from: victor});

            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 5), "delegated addres is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");

            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(victor, 6), "delegated addres is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(loi, 6), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is wrong");
        });

        it("Test deposit with many stakers", async function() {
            await deployStakingContract(6, currentBlock + 20);

            await kncToken.transfer(victor, precision.mul(new BN(1000)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(1000)), {from: victor});
            await kncToken.transfer(loi, precision.mul(new BN(1000)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(1000)), {from: loi});
            await kncToken.transfer(mike, precision.mul(new BN(1000)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(1000)), {from: mike});

            await stakingContract.deposit(precision.mul(new BN(100)), {from: mike});
            await stakingContract.deposit(precision.mul(new BN(200)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(300)), {from: loi});

            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getStakesValue(mike, 1), "stake value is wrong");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getStakesValue(victor, 1), "stake value is wrong");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getStakesValue(loi, 1), "stake value is wrong");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock + epochPeriod - currentBlock);
    
            await stakingContract.deposit(precision.mul(new BN(200)), {from: mike});
            await stakingContract.deposit(precision.mul(new BN(300)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(400)), {from: loi});

            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getStakesValue(mike, 2), "stake value is wrong");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getStakesValue(victor, 2), "stake value is wrong");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getStakesValue(loi, 2), "stake value is wrong");

            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getStakesValue(mike, 3), "stake value is wrong");
            Helper.assertEqual(precision.mul(new BN(500)), await stakingContract.getStakesValue(victor, 3), "stake value is wrong");
            Helper.assertEqual(precision.mul(new BN(700)), await stakingContract.getStakesValue(loi, 3), "stake value is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getStakes(mike, 5), "stake value is wrong");
            Helper.assertEqual(precision.mul(new BN(500)), await stakingContract.getStakes(victor, 5), "stake value is wrong");
            Helper.assertEqual(precision.mul(new BN(700)), await stakingContract.getStakes(loi, 5), "stake value is wrong");

            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getLatestStakeBalance(mike), "latest stake value is wrong");
            Helper.assertEqual(precision.mul(new BN(500)), await stakingContract.getLatestStakeBalance(victor), "latest stake value is wrong");
            Helper.assertEqual(precision.mul(new BN(700)), await stakingContract.getLatestStakeBalance(loi), "latest stake value is wrong");
        });

        it("Test deposit should revert when amount is 0", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: victor});

            try {
                await stakingContract.deposit(0, {from: victor});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await stakingContract.deposit(precision.mul(new BN(90)), {from: victor});
        });

        it("Test deposit should revert when not enough balance or allowance", async function() {
            await deployStakingContract(10, currentBlock + 10);

            // has 100 tokens, approve enough but try to deposit more
            await kncToken.transfer(victor, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: victor});
            try {
                await stakingContract.deposit(precision.mul(new BN(200)), {from: victor});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await stakingContract.deposit(precision.mul(new BN(90)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(10)), {from: victor});

            // has more tokens, approve small amounts and try to deposit more than allowances
            await kncToken.transfer(mike, precision.mul(new BN(1000)));
            // not approve yet, should revert
            try {
                await stakingContract.deposit(precision.mul(new BN(100)), {from: mike});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            // approve and deposit more than allowance
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: mike});
            try {
                await stakingContract.deposit(precision.mul(new BN(200)), {from: mike});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            // total deposit more than allowances
            await stakingContract.deposit(precision.mul(new BN(50)), {from: mike});
            try {
                await stakingContract.deposit(precision.mul(new BN(51)), {from: mike});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            await stakingContract.deposit(precision.mul(new BN(50)), {from: mike});
        });

        it("Test deposit data is inited correctly", async function() {
            await deployStakingContract(10, currentBlock + 10);

            // has 100 tokens, approve enough but try to deposit more
            await kncToken.transfer(victor, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);

            await stakingContract.deposit(precision.mul(new BN(10)), {from: victor});
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 1), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 2), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 3), "shouldn't be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 4), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 5), "should be inited data");

            await stakingContract.delegate(loi, {from: victor});

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 8), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 9), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 8), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 9), "shouldn't be inited data");

            await stakingContract.deposit(precision.mul(new BN(20)), {from: victor});
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 8), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 9), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(loi, 8), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(loi, 9), "should be inited data");

            await stakingContract.delegate(mike, {from: victor});
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 12), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 13), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 12), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 13), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 12), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 13), "shouldn't be inited data");

            await stakingContract.deposit(precision.mul(new BN(50)), {from: victor});
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(mike, 12), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(mike, 13), "should be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 12), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 13), "shouldn't be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 12), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 13), "should be inited data");
        });
    });

    describe("#Withdrawal Tests", () => {
        it("Test withdraw should revert when amount more than current deposited amount", async function() {
            await deployStakingContract(10, currentBlock + 20);

            await kncToken.transfer(victor, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});

            await kncToken.transfer(mike, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: mike});
            await stakingContract.deposit(precision.mul(new BN(100)), {from: mike});

            await kncToken.transfer(loi, precision.mul(new BN(800)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(800)), {from: loi});
            await stakingContract.deposit(precision.mul(new BN(800)), {from: loi});

            Helper.assertEqual(0, await stakingContract.getStakes(victor, 0), "stake at epoch 0 is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getStakes(victor, 1), "stake at epoch 0 is wrong");
            Helper.assertEqual(precision.mul(new BN(800)), await stakingContract.getStakes(loi, 1), "stake at epoch 1 is wrong");

            try {
                await stakingContract.withdraw(precision.mul(new BN(900)), {from: loi});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        
            await stakingContract.withdraw(precision.mul(new BN(100)), {from: victor});

            Helper.assertEqual(0, await stakingContract.getStakes(victor, 0), "stake at epoch 0 is wrong");
            Helper.assertEqual(0, await stakingContract.getStakes(loi, 0), "stake at epoch 0 is wrong");
            Helper.assertEqual(0, await stakingContract.getStakes(victor, 1), "stake at epoch 1 is wrong");

            Helper.assertEqual(precision.mul(new BN(800)), await stakingContract.getStakes(loi, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getStakes(mike, 1), "stake at epoch 1 is wrong");

            Helper.assertEqual(
                0, await stakingContract.getLatestStakeBalance(victor), "latest stake is incorrect"
            );
            Helper.assertEqual(
                precision.mul(new BN(800)), await stakingContract.getLatestStakeBalance(loi), "latest stake is incorrect"
            );
            Helper.assertEqual(
                precision.mul(new BN(100)), await stakingContract.getLatestStakeBalance(mike), "latest stake is incorrect"
            );
        });

        it("Test withdraw should revert when no stakes but has delegated stake", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(500)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(500)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});

            await stakingContract.delegate(mike, {from: victor});
            await stakingContract.deposit(precision.mul(new BN(200)), {from: victor});

            // mike can not withdraw
            try {
                await stakingContract.withdraw(precision.mul(new BN(100)), {from: mike});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            // victor can withdraw
            await stakingContract.withdraw(precision.mul(new BN(100)), {from: victor});
        });

        it("Test withdraw (partial + full), stakes change as expected - no delegation", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(500)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(500)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(500)), {from: victor});

            await stakingContract.withdraw(precision.mul(new BN(50)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(450)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(precision.mul(new BN(450)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.withdraw(precision.mul(new BN(100)), {from: victor});
    
            Helper.assertEqual(precision.mul(new BN(350)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(precision.mul(new BN(350)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");

            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
    
            await stakingContract.withdraw(precision.mul(new BN(40)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(310)), await stakingContract.getStakesValue(victor, 5), "stake at epoch 5 should be correct");
            Helper.assertEqual(precision.mul(new BN(310)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 5 * epochPeriod);

            // withdraw full
            await stakingContract.withdraw(precision.mul(new BN(310)), {from: victor});

            Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 9), "stake at epoch 9 should be correct");
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");

            try {
                await stakingContract.withdraw(precision.mul(new BN(10)), {from: victor});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });

        it("Test withdraw (partial + full), stakes change as expected - with delegation", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(500)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(500)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(500)), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            await stakingContract.withdraw(precision.mul(new BN(50)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(450)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake should be correct");
            Helper.assertEqual(precision.mul(new BN(450)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance should be correct");

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.withdraw(precision.mul(new BN(100)), {from: victor});
    
            Helper.assertEqual(precision.mul(new BN(350)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake should be correct");
            Helper.assertEqual(precision.mul(new BN(350)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance should be correct");


            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
    
            await stakingContract.withdraw(precision.mul(new BN(40)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(310)), await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake should be correct");
            Helper.assertEqual(precision.mul(new BN(310)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance should be correct");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 5 * epochPeriod);

            // withdraw full
            await stakingContract.withdraw(precision.mul(new BN(310)), {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 9), "delegated stake should be correct");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance should be correct");

            try {
                await stakingContract.withdraw(precision.mul(new BN(10)), {from: victor});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });


        it("Test withdraw more than current epoch stake, but less than total stake", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(500)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(500)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(300)), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});

            // total victor has 400 knc, at current epoch (1) he has 300 knc
            await stakingContract.withdraw(precision.mul(new BN(350)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
        });

        it("Test withdraw before new deposit, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(500)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(500)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(400)), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.withdraw(precision.mul(new BN(200)), {from: victor});

            // check stake of victor
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
            // check delegated stake of mike
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");

            // deposit again
            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});
            // check stake of victor
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
            // check delegated stake of mike
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");
        });

        it("Test withdraw less than new deposit, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(500)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(500)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(400)), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});
            await stakingContract.withdraw(precision.mul(new BN(50)), {from: victor});

            // check stake of victor
            Helper.assertEqual(precision.mul(new BN(400)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(precision.mul(new BN(450)), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
            Helper.assertEqual(precision.mul(new BN(450)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
            // check delegated stake of mike
            Helper.assertEqual(precision.mul(new BN(400)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
            Helper.assertEqual(precision.mul(new BN(450)), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
            Helper.assertEqual(precision.mul(new BN(450)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");
        });

        it("Test withdraw total more than new deposit, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(500)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(500)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(400)), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});
            await stakingContract.withdraw(precision.mul(new BN(50)), {from: victor});
            await stakingContract.withdraw(precision.mul(new BN(150)), {from: victor});

            // check stake of victor
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
            // check delegated stake of mike
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");
        });

        it("Test withdraw tal more than new deposit, then deposit again stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(1000)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(1000)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(400)), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});
            await stakingContract.withdraw(precision.mul(new BN(150)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(200)), {from: victor});

            // check stake of victor
            Helper.assertEqual(precision.mul(new BN(350)), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(precision.mul(new BN(550)), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
            Helper.assertEqual(precision.mul(new BN(550)), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
            // check delegated stake of mike
            Helper.assertEqual(precision.mul(new BN(350)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
            Helper.assertEqual(precision.mul(new BN(550)), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
            Helper.assertEqual(precision.mul(new BN(550)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");
        });

        it("Test withdraw right before starting new epoch", async function() {
            await deployStakingContract(10, currentBlock + 20);

            await kncToken.transfer(victor, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});

            await kncToken.transfer(mike, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: mike});
            await stakingContract.deposit(precision.mul(new BN(100)), {from: mike});

            await kncToken.transfer(loi, precision.mul(new BN(800)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(800)), {from: loi});
            await stakingContract.deposit(precision.mul(new BN(800)), {from: loi});

            Helper.assertEqual(0, await stakingContract.getStakes(victor, 0), "stake at epoch 0 is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getStakes(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(800)), await stakingContract.getStakes(loi, 1), "stake at epoch 1 is wrong");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[1], startBlock + epochPeriod - currentBlock - 2);
            // withdraw at end of epoch 1
            await stakingContract.withdraw(precision.mul(new BN(600)), {from: loi});

            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getStakes(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getStakes(loi, 1), "stake at epoch 1 is wrong");

            // withdraw at beginning of epoch 2
            await stakingContract.withdraw(precision.mul(new BN(50)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getStakes(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getStakes(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getStakes(loi, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getStakes(mike, 2), "stake at epoch 2 is wrong");
        
            Helper.assertEqual(
                precision.mul(new BN(50)), await stakingContract.getLatestStakeBalance(victor), "latest stake is incorrect"
            );
            Helper.assertEqual(
                precision.mul(new BN(200)), await stakingContract.getLatestStakeBalance(loi), "latest stake is incorrect"
            );
            Helper.assertEqual(
                precision.mul(new BN(100)), await stakingContract.getLatestStakeBalance(mike), "latest stake is incorrect"
            );
        });

        it("Test withdraw data is inited correctly", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);

            await stakingContract.withdraw(precision.mul(new BN(10)), {from: victor});
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 3), "shouldn't be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 4), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 5), "should be inited data");

            await stakingContract.delegate(mike, {from: victor});

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 8), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 9), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 8), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 9), "shouldn't be inited data");

            await stakingContract.withdraw(precision.mul(new BN(20)), {from: victor});
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 8), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 9), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(mike, 8), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(mike, 9), "should be inited data");

            await stakingContract.delegate(loi, {from: victor});
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 12), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 13), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 12), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 13), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 12), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 13), "shouldn't be inited data");

            await stakingContract.withdraw(precision.mul(new BN(20)), {from: victor});
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 12), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 13), "should be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 12), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 13), "shouldn't be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(loi, 12), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(loi, 13), "should be inited data");

        });
    });

    describe("#Delegate Tests", () => {
        it("Test delegate, delegated address and stake change as expected", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: victor});

            await stakingContract.delegate(mike, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            await stakingContract.deposit(precision.mul(new BN(50)), {from: victor});

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");

            await stakingContract.delegate(loi, {from: victor});

            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");

            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getDelegatedStakesValue(loi, 6), "delegated stake is incorrect");

            await stakingContract.deposit(precision.mul(new BN(50)), {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(loi, 6), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is incorrect");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod - 5);

            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(mike, 9), "delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakes(loi, 9), "delegated stake is incorrect");
        });

        it("Test delegate same address many times", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: victor});

            await stakingContract.delegate(mike, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            await stakingContract.deposit(precision.mul(new BN(50)), {from: victor});

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");

            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod - 3);

            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getDelegatedStakes(mike, 10), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
        });

        it("Test delegate, then delegate back to yourself", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: victor});

            await stakingContract.delegate(mike, {from: victor});
            await stakingContract.deposit(precision.mul(new BN(50)), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getDelegatedStakes(mike, 4), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");

            await stakingContract.delegate(victor, {from: victor});

            Helper.assertEqual(victor, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            // delegate back to yourself, shouldn't have any delegated stake
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is incorrect");

            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
        });

        it("Test delegate after few epochs didn't do anything", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
        });

        it("Test delegate then deposit more at current + next + after few epochs", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(400)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(400)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            await stakingContract.delegate(mike, {from: victor});
            await stakingContract.deposit(precision.mul(new BN(40)), {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(140)), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            await stakingContract.deposit(precision.mul(new BN(60)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(140)), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakesValue(mike, 7), "delegated stake is incorrect");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod * 4);
            await stakingContract.deposit(precision.mul(new BN(200)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakesValue(mike, 10), "delegated stake is incorrect");
            Helper.assertEqual(precision.mul(new BN(400)), await stakingContract.getDelegatedStakesValue(mike, 11), "delegated stake is incorrect");
        });

        it("Test delegate from many addresses, stakes change as expected", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(400)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(400)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});

            await kncToken.transfer(mike, precision.mul(new BN(400)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(400)), {from: mike});
            await stakingContract.deposit(precision.mul(new BN(100)), {from: mike});

            await stakingContract.delegate(loi, {from: victor});
            await stakingContract.delegate(loi, {from: mike});

            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(mike), "delegated address is wrong");
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(victor), "delegated address is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod - 4);
            await stakingContract.withdraw(precision.mul(new BN(10)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(190)), await stakingContract.getDelegatedStakesValue(loi, 4), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(190)), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(mike), "delegated address is wrong");
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(victor), "delegated address is wrong");

            await stakingContract.delegate(victor, {from: victor});

            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(mike), "delegated address is wrong");
            Helper.assertEqual(victor, await stakingContract.getLatestDelegatedAddress(victor), "delegated address is wrong");
        });

        it("Test delegate then withdraw, stakes change as expected", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(400)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(400)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(400)), {from: victor});

            await stakingContract.delegate(loi, {from: victor});
            await stakingContract.withdraw(precision.mul(new BN(100)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is not correct");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);
            await stakingContract.withdraw(precision.mul(new BN(100)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is not correct");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is not correct");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod - 4);

            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakes(loi, 4), "delegated stake is not correct");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakes(loi, 5), "delegated stake is not correct");

            await stakingContract.withdraw(precision.mul(new BN(10)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(190)), await stakingContract.getDelegatedStakesValue(loi, 4), "delegated stake is not correct");
            Helper.assertEqual(precision.mul(new BN(190)), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is not correct");
            Helper.assertEqual(precision.mul(new BN(190)), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");
        });

        it("Test delegate then withdraw after new deposit, stakes change as expected", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(400)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(400)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(300)), {from: victor});

            await stakingContract.delegate(loi, {from: victor});
            await stakingContract.withdraw(precision.mul(new BN(100)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is not correct");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);
            await stakingContract.withdraw(precision.mul(new BN(100)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is not correct");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is not correct");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod - 4);

            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakes(loi, 4), "delegated stake is not correct");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakes(loi, 5), "delegated stake is not correct");

            await stakingContract.deposit(precision.mul(new BN(50)), {from: victor});
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(loi, 4), "delegated stake is not correct");
            Helper.assertEqual(precision.mul(new BN(150)), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is not correct");

            await stakingContract.withdraw(precision.mul(new BN(10)), {from: victor});

            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(loi, 4), "delegated stake is not correct");
            Helper.assertEqual(precision.mul(new BN(140)), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is not correct");
            Helper.assertEqual(precision.mul(new BN(140)), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");
        });

        it("Test delegate at end and begin of an epoch", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(400)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(400)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(300)), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock - 2);
            // delegate at end of epoch
            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 0), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated address is wrong");
            Helper.assertEqual(victor, await stakingContract.getDelegatedAddressValue(victor, 0), "delegated address is wrong");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);
            // delegate at begin of epoch 2
            await stakingContract.delegate(loi, {from: victor});

            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getDelegatedStakesValue(loi, 3), "delegated stake is wrong");

            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 2), "delegated address is wrong");
            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(victor, 3), "delegated address is wrong");
        });

        it("Test delegate circulation, data changes as expect", async function() {
            await deployStakingContract(10, currentBlock + 20);

            await kncToken.transfer(victor, precision.mul(new BN(400)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(400)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});

            await kncToken.transfer(mike, precision.mul(new BN(400)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(400)), {from: mike});
            await stakingContract.deposit(precision.mul(new BN(200)), {from: mike});

            await kncToken.transfer(loi, precision.mul(new BN(400)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(400)), {from: loi});
            await stakingContract.deposit(precision.mul(new BN(300)), {from: loi});

            await stakingContract.delegate(mike, {from: victor});
            await stakingContract.delegate(loi, {from: mike});
            await stakingContract.delegate(victor, {from: loi});

            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(mike, 1), "delegated address is wrong");
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(mike), "latest delegated address is wrong");

            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(victor, await stakingContract.getDelegatedAddressValue(loi, 1), "delegated address is wrong");
            Helper.assertEqual(victor, await stakingContract.getLatestDelegatedAddress(loi), "latest delegated address is wrong");

            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getDelegatedStakesValue(victor, 1), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated address is wrong");
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is wrong");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.deposit(precision.mul(new BN(50)), {from: mike});
            Helper.assertEqual(precision.mul(new BN(250)), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(250)), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(300)), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

            await stakingContract.withdraw(precision.mul(new BN(50)), {from: loi});
            Helper.assertEqual(precision.mul(new BN(250)), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(250)), await stakingContract.getDelegatedStakesValue(victor, 1), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(250)), await stakingContract.getDelegatedStakesValue(victor, 2), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(250)), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod * 4);
            Helper.assertEqual(precision.mul(new BN(250)), await stakingContract.getDelegatedStakes(victor, 4), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakes(mike, 4), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(250)), await stakingContract.getDelegatedStakes(loi, 4), "delegated stake is wrong");

            await stakingContract.delegate(mike, {from: loi});
            Helper.assertEqual(precision.mul(new BN(250)), await stakingContract.getDelegatedStakesValue(victor, 5), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(250)), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is wrong");

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(victor, 6), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(350)), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(250)), await stakingContract.getDelegatedStakesValue(loi, 6), "delegated stake is wrong");
        });

        it("Test delegate, then delegate to another, deposit + withdraw stakes change as expected", async function() {
            await deployStakingContract(10, currentBlock + 20);

            await kncToken.transfer(victor, precision.mul(new BN(400)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(400)), {from: victor});
            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});

            await stakingContract.delegate(mike, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            await stakingContract.delegate(loi, {from: victor});
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated address is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(victor, 2), "delegated address is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");

            await stakingContract.deposit(precision.mul(new BN(100)), {from: victor});
            Helper.assertEqual(precision.mul(new BN(100)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated address is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(victor, 2), "delegated address is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(200)), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");

            await stakingContract.withdraw(precision.mul(new BN(150)), {from: victor});
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated address is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(victor, 2), "delegated address is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(precision.mul(new BN(50)), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");
        });

        it("Test delegate data is inited correctly", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, precision.mul(new BN(100)));
            await kncToken.approve(stakingContract.address, precision.mul(new BN(100)), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);

            await stakingContract.delegate(mike, {from: victor});
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 3), "shouldn't be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 4), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 5), "should be inited data");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 8), "should be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 9), "should be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 8), "should be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 9), "should be inited data");

            await stakingContract.delegate(mike, {from: victor});
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 8), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 9), "should be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 8), "shouldn't't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 9), "shouldn't be inited data");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 12), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 13), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 12), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 13), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 12), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 13), "shouldn't be inited data");

            await stakingContract.delegate(loi, {from: victor});
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 12), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 13), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(mike, 12), "shouldn't be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(mike, 13), "shouldn't be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(loi, 12), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(loi, 13), "should be inited data");
        });
    });
});

