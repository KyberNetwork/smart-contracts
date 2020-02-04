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
            await deployStakingContract(10, currentBlock + 20);

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
    });
});

