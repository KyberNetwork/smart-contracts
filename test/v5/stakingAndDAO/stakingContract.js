const TestToken = artifacts.require("Token.sol");
const MockKyberDAO = artifacts.require("MockSimpleDAO.sol");
const MockDAOWithdrawFailed = artifacts.require("MockDAOWithdrawFailed.sol");
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

        try {
            await stakingContract.updateDAOAddressAndRemoveAdmin(daoContract.address, {from: admin});
            assert(false, "throw was expected in line above.")
        } catch (e) {
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
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

            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

            Helper.assertEqual(0, await stakingContract.getStakes(victor, 0), "stake at epoch 0 is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // delay to start of epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock - 1);
            await stakingContract.deposit(mulPrecision(20), {from: victor});

            Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(20), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // delay to start of epoch 4
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock - 1);
            await stakingContract.deposit(mulPrecision(30), {from: victor});

            assert.equal(false, await stakingContract.getHasInitedValue(victor, 3), "shouldn't init value at epoch 3");
            Helper.assertEqual(mulPrecision(20), await stakingContract.getStakes(victor, 3), "stake at epoch 3 is wrong");

            Helper.assertEqual(mulPrecision(20), await stakingContract.getStakesValue(victor, 4), "stake at epoch 4 is wrong");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 5), "stake at epoch 5 is wrong");
        });

        it("Test deposit at end of epoch, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

            Helper.assertEqual(0, await stakingContract.getStakes(victor, 0), "stake at epoch 0 is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            await stakingContract.deposit(mulPrecision(10), {from: victor});

            Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 0), "stake at epoch 0 is wrong");
            Helper.assertEqual(mulPrecision(10), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 2), "shouldn't init value at epoch 2");
            Helper.assertEqual(mulPrecision(10), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // delay to end of epoch 0
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock - 2);
            await stakingContract.deposit(mulPrecision(20), {from: victor});

            Helper.assertEqual(mulPrecision(30), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 2), "shouldn't init value at epoch 2");
            assert.equal(false, await stakingContract.getHasInitedValue(victor, 2), "shouldn't init value at epoch 2");
            Helper.assertEqual(mulPrecision(30), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // delay to end of epoch 2
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2 * epochPeriod + startBlock - currentBlock - 2);
            await stakingContract.deposit(mulPrecision(20), {from: victor});

            assert.equal(true, await stakingContract.getHasInitedValue(victor, 2), "shouldn't init value at epoch 2");
            Helper.assertEqual(mulPrecision(30), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 3), "should have inited value at epoch 3");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
        });

        it("Test deposit then withdraw at same + different epoch, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, mulPrecision(200));
            await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});

            // deposit at epoch 0
            await stakingContract.deposit(mulPrecision(50), {from: victor});
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);
            // deposit at epoch 1
            await stakingContract.deposit(mulPrecision(60), {from: victor});

            Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(110), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(mulPrecision(110), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            await stakingContract.withdraw(mulPrecision(20), {from: victor});
            Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(90), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(mulPrecision(90), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            currentBlock = await Helper.getCurrentBlock();
            // delay few epochs
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod * 6 + startBlock - currentBlock + 1);

            await stakingContract.withdraw(mulPrecision(30), {from: victor});
            Helper.assertEqual(mulPrecision(90), await stakingContract.getStakes(victor, 6), "stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(60), await stakingContract.getStakesValue(victor, 7), "stake at epoch 2 is wrong");
            Helper.assertEqual(mulPrecision(60), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
        });

        it("Test deposit then withdraw + deposit again at same epoch, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, mulPrecision(200));
            await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});

            // deposit at epoch 0
            await stakingContract.deposit(mulPrecision(50), {from: victor});
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.withdraw(mulPrecision(20), {from: victor});
            Helper.assertEqual(mulPrecision(30), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(30), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(mulPrecision(30), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            await stakingContract.deposit(mulPrecision(50), {from: victor});
            Helper.assertEqual(mulPrecision(30), await stakingContract.getStakes(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(80), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(mulPrecision(80), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
        });

        it("Test deposit after full withdraw, stakes change as expected - no delegation", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, mulPrecision(200));
            await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});

            // deposit at epoch 0
            await stakingContract.deposit(mulPrecision(50), {from: victor});
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            await stakingContract.withdraw(mulPrecision(50), {from: victor});
            Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            await stakingContract.deposit(mulPrecision(50), {from: victor});
            Helper.assertEqual(0, await stakingContract.getStakes(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod);
            await stakingContract.deposit(mulPrecision(20), {from: victor});
            Helper.assertEqual(mulPrecision(50), await stakingContract.getStakes(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(mulPrecision(70), await stakingContract.getStakesValue(victor, 3), "stake at epoch 3 is wrong");
            Helper.assertEqual(mulPrecision(70), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
        });

        it("Test deposit after full withdraw, stakes change as expected - with delegation", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, mulPrecision(200));
            await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});

            // deposit at epoch 0
            await stakingContract.deposit(mulPrecision(50), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakes(mike, 1), "delegated stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance is wrong");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.withdraw(mulPrecision(50), {from: victor});
            Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakes(mike, 1), "delegated stake at epoch 1 is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance is wrong");

            await stakingContract.deposit(mulPrecision(40), {from: victor});
            Helper.assertEqual(0, await stakingContract.getStakes(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(40), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(mulPrecision(40), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
            Helper.assertEqual(mulPrecision(40), await stakingContract.getDelegatedStakes(mike, 2), "delegated stake at epoch 2 is wrong");
            Helper.assertEqual(mulPrecision(40), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod);
            await stakingContract.deposit(mulPrecision(20), {from: victor});
            Helper.assertEqual(mulPrecision(40), await stakingContract.getStakes(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(mulPrecision(60), await stakingContract.getStakesValue(victor, 3), "stake at epoch 3 is wrong");
            Helper.assertEqual(mulPrecision(60), await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
            Helper.assertEqual(mulPrecision(40), await stakingContract.getDelegatedStakes(mike, 2), "delegated stake at epoch 2 is wrong");
            Helper.assertEqual(mulPrecision(60), await stakingContract.getDelegatedStakes(mike, 3), "delegated stake at epoch 3 is wrong");
            Helper.assertEqual(mulPrecision(60), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance is wrong");
        });

        it("Test deposit few consecutive epochs + after few epochs, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, mulPrecision(1000));
            await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: victor});

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

            await kncToken.transfer(victor, mulPrecision(1000));
            await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: victor});

            await stakingContract.deposit(mulPrecision(100), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 0), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated addres is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");

            await stakingContract.deposit(mulPrecision(20), {from: victor});
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 0), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(120), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(120), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");

            // delay to next epoch
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            await stakingContract.deposit(mulPrecision(30), {from: victor});
            Helper.assertEqual(mulPrecision(120), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(150), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(150), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 2), "delegated addres is wrong");

            // delay few epochs
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
            await stakingContract.deposit(mulPrecision(50), {from: victor});
            Helper.assertEqual(mulPrecision(150), await stakingContract.getDelegatedStakes(mike, 5), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 6), "delegated addres is wrong");
        });

        it("Test deposit then delegate, then delegate again at same + different epoch", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(1000));
            await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: victor});

            await stakingContract.delegate(mike, {from: victor});
            await stakingContract.deposit(mulPrecision(100), {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 0), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated addres is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");

            await stakingContract.delegate(loi, {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated addres is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 2), "delegated addres is wrong");

            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated addres is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(loi), "delegated stake is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
            await stakingContract.delegate(loi, {from: victor});

            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 5), "delegated addres is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "delegated stake is wrong");

            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(victor, 6), "delegated addres is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 6), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is wrong");
        });

        it("Test deposit with many stakers", async function() {
            await deployStakingContract(6, currentBlock + 20);

            await kncToken.transfer(victor, mulPrecision(1000));
            await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: victor});
            await kncToken.transfer(loi, mulPrecision(1000));
            await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: loi});
            await kncToken.transfer(mike, mulPrecision(1000));
            await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: mike});

            await stakingContract.deposit(mulPrecision(100), {from: mike});
            await stakingContract.deposit(mulPrecision(200), {from: victor});
            await stakingContract.deposit(mulPrecision(300), {from: loi});

            Helper.assertEqual(mulPrecision(100), await stakingContract.getStakesValue(mike, 1), "stake value is wrong");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getStakesValue(victor, 1), "stake value is wrong");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getStakesValue(loi, 1), "stake value is wrong");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock + epochPeriod - currentBlock);

            await stakingContract.deposit(mulPrecision(200), {from: mike});
            await stakingContract.deposit(mulPrecision(300), {from: victor});
            await stakingContract.deposit(mulPrecision(400), {from: loi});

            Helper.assertEqual(mulPrecision(100), await stakingContract.getStakesValue(mike, 2), "stake value is wrong");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getStakesValue(victor, 2), "stake value is wrong");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getStakesValue(loi, 2), "stake value is wrong");

            Helper.assertEqual(mulPrecision(300), await stakingContract.getStakesValue(mike, 3), "stake value is wrong");
            Helper.assertEqual(mulPrecision(500), await stakingContract.getStakesValue(victor, 3), "stake value is wrong");
            Helper.assertEqual(mulPrecision(700), await stakingContract.getStakesValue(loi, 3), "stake value is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
            Helper.assertEqual(mulPrecision(300), await stakingContract.getStakes(mike, 5), "stake value is wrong");
            Helper.assertEqual(mulPrecision(500), await stakingContract.getStakes(victor, 5), "stake value is wrong");
            Helper.assertEqual(mulPrecision(700), await stakingContract.getStakes(loi, 5), "stake value is wrong");

            Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestStakeBalance(mike), "latest stake value is wrong");
            Helper.assertEqual(mulPrecision(500), await stakingContract.getLatestStakeBalance(victor), "latest stake value is wrong");
            Helper.assertEqual(mulPrecision(700), await stakingContract.getLatestStakeBalance(loi), "latest stake value is wrong");
        });

        it("Test deposit data is inited correctly", async function() {
            await deployStakingContract(10, currentBlock + 10);

            // has 100 tokens, approve enough but try to deposit more
            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);

            await stakingContract.deposit(mulPrecision(10), {from: victor});
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

            await stakingContract.deposit(mulPrecision(20), {from: victor});
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

            await stakingContract.deposit(mulPrecision(50), {from: victor});
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(mike, 12), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(mike, 13), "should be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 12), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(loi, 13), "shouldn't be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 12), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 13), "should be inited data");
        });

        it("Test deposit balances change as expected", async function() {
            await deployStakingContract(4, currentBlock + 20);

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

            let expectedUserBal = await kncToken.balanceOf(victor);
            let expectedStakingBal = await kncToken.balanceOf(stakingContract.address);

            await stakingContract.deposit(mulPrecision(100), {from: victor});

            expectedUserBal.isub(mulPrecision(100));
            expectedStakingBal.iadd(mulPrecision(100));

            Helper.assertEqual(expectedUserBal, await kncToken.balanceOf(victor), "user balance is not changed as expected");
            Helper.assertEqual(expectedStakingBal, await kncToken.balanceOf(stakingContract.address), "staking balance is not changed as expected");

            await stakingContract.deposit(mulPrecision(200), {from: victor});
            expectedUserBal.isub(mulPrecision(200));
            expectedStakingBal.iadd(mulPrecision(200));

            Helper.assertEqual(expectedUserBal, await kncToken.balanceOf(victor), "user balance is not changed as expected");
            Helper.assertEqual(expectedStakingBal, await kncToken.balanceOf(stakingContract.address), "staking balance is not changed as expected");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 30);

            await stakingContract.deposit(mulPrecision(100), {from: victor});

            expectedUserBal.isub(mulPrecision(100));
            expectedStakingBal.iadd(mulPrecision(100));

            Helper.assertEqual(expectedUserBal, await kncToken.balanceOf(victor), "user balance is not changed as expected");
            Helper.assertEqual(expectedStakingBal, await kncToken.balanceOf(stakingContract.address), "staking balance is not changed as expected");
        });

        it("Test deposit large amount of tokens, check for overflow", async function() {
            await deployStakingContract(4, currentBlock + 20);

            let totalAmount = precision.mul(new BN(10).pow(new BN(8))).mul(new BN(2)); // 200M tokens
            await kncToken.transfer(victor, totalAmount);
            await kncToken.approve(stakingContract.address, totalAmount, {from: victor});
            await stakingContract.deposit(totalAmount, {from: victor});

            Helper.assertEqual(totalAmount, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
            Helper.assertEqual(totalAmount, await stakingContract.getStakes(victor, 1), "stake is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 17);

            let withdrawAmount = precision.mul(new BN(10).pow(new BN(8))); // 100M tokens
            await stakingContract.withdraw(withdrawAmount, {from: victor});
            totalAmount.isub(withdrawAmount);

            Helper.assertEqual(totalAmount, await stakingContract.getLatestStakeBalance(victor), "latest stake balance is wrong");
            Helper.assertEqual(totalAmount, await stakingContract.getStakes(victor, 1), "stake is wrong");
            Helper.assertEqual(totalAmount, await stakingContract.getStakes(victor, 2), "stake is wrong");

            await stakingContract.delegate(mike, {from: victor});
            Helper.assertEqual(totalAmount, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(totalAmount, await stakingContract.getDelegatedStakes(mike, 2), "delegated stake is wrong");
        });

        it("Test deposit gas usages", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(1000));
            await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: victor});

            let tx = await stakingContract.deposit(mulPrecision(100), {from: victor});
            logInfo("Deposit no delegation: init 2 epochs data, gas used: " + tx.receipt.cumulativeGasUsed);

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);
            tx = await stakingContract.deposit(mulPrecision(50), {from: victor});
            logInfo("Deposit no delegation: init 1 epoch data, gas used: " + tx.receipt.cumulativeGasUsed);
            tx = await stakingContract.deposit(mulPrecision(50), {from: victor});
            logInfo("Deposit no delegation: no init epoch data, gas used: " + tx.receipt.cumulativeGasUsed);

            await stakingContract.delegate(mike, {from: victor});
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);
            tx = await stakingContract.deposit(mulPrecision(100), {from: victor});
            logInfo("Deposit has delegation: init 2 epochs data, gas used: " + tx.receipt.cumulativeGasUsed);
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            tx = await stakingContract.deposit(mulPrecision(50), {from: victor});
            logInfo("Deposit has delegation: init 1 epoch data, gas used: " + tx.receipt.cumulativeGasUsed);
            tx = await stakingContract.deposit(mulPrecision(50), {from: victor});
            logInfo("Deposit has delegation: no init epoch data, gas used: " + tx.receipt.cumulativeGasUsed);
        });
    });

    describe("#Withdrawal Tests", () => {
        it("Test withdraw (partial + full), stakes change as expected - no delegation", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
            await stakingContract.deposit(mulPrecision(500), {from: victor});

            await stakingContract.withdraw(mulPrecision(50), {from: victor});

            Helper.assertEqual(mulPrecision(450), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(mulPrecision(450), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            Helper.assertEqual(mulPrecision(350), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(mulPrecision(350), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");

            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);

            await stakingContract.withdraw(mulPrecision(40), {from: victor});

            Helper.assertEqual(mulPrecision(310), await stakingContract.getStakesValue(victor, 5), "stake at epoch 5 should be correct");
            Helper.assertEqual(mulPrecision(310), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 5 * epochPeriod);

            // withdraw full
            await stakingContract.withdraw(mulPrecision(310), {from: victor});

            Helper.assertEqual(0, await stakingContract.getStakesValue(victor, 9), "stake at epoch 9 should be correct");
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");

            try {
                await stakingContract.withdraw(mulPrecision(10), {from: victor});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });

        it("Test withdraw (partial + full), stakes change as expected - with delegation", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
            await stakingContract.deposit(mulPrecision(500), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            await stakingContract.withdraw(mulPrecision(50), {from: victor});

            Helper.assertEqual(mulPrecision(450), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake should be correct");
            Helper.assertEqual(mulPrecision(450), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance should be correct");

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            Helper.assertEqual(mulPrecision(350), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake should be correct");
            Helper.assertEqual(mulPrecision(350), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance should be correct");

            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);

            await stakingContract.withdraw(mulPrecision(40), {from: victor});

            Helper.assertEqual(mulPrecision(310), await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake should be correct");
            Helper.assertEqual(mulPrecision(310), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance should be correct");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 5 * epochPeriod);

            // withdraw full
            await stakingContract.withdraw(mulPrecision(310), {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 9), "delegated stake should be correct");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake balance should be correct");

            try {
                await stakingContract.withdraw(mulPrecision(10), {from: victor});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });


        it("Test withdraw more than current epoch stake, but less than total stake", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
            await stakingContract.deposit(mulPrecision(300), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.deposit(mulPrecision(100), {from: victor});

            // total victor has 400 knc, at current epoch (1) he has 300 knc
            await stakingContract.withdraw(mulPrecision(350), {from: victor});

            Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
        });

        it("Test withdraw before new deposit, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
            await stakingContract.deposit(mulPrecision(400), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.withdraw(mulPrecision(200), {from: victor});

            // check stake of victor
            Helper.assertEqual(mulPrecision(200), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
            // check delegated stake of mike
            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");

            // deposit again
            await stakingContract.deposit(mulPrecision(100), {from: victor});
            // check stake of victor
            Helper.assertEqual(mulPrecision(200), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
            // check delegated stake of mike
            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");
        });

        it("Test withdraw less than new deposit, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
            await stakingContract.deposit(mulPrecision(400), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.deposit(mulPrecision(100), {from: victor});
            await stakingContract.withdraw(mulPrecision(50), {from: victor});

            // check stake of victor
            Helper.assertEqual(mulPrecision(400), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(mulPrecision(450), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
            Helper.assertEqual(mulPrecision(450), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
            // check delegated stake of mike
            Helper.assertEqual(mulPrecision(400), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
            Helper.assertEqual(mulPrecision(450), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
            Helper.assertEqual(mulPrecision(450), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");
        });

        it("Test withdraw total more than new deposit, stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
            await stakingContract.deposit(mulPrecision(400), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.deposit(mulPrecision(100), {from: victor});
            await stakingContract.withdraw(mulPrecision(50), {from: victor});
            await stakingContract.withdraw(mulPrecision(150), {from: victor});

            // check stake of victor
            Helper.assertEqual(mulPrecision(300), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
            // check delegated stake of mike
            Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");
        });

        it("Test withdraw total more than new deposit, then deposit again stakes change as expected", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(1000));
            await kncToken.approve(stakingContract.address, mulPrecision(1000), {from: victor});
            await stakingContract.deposit(mulPrecision(400), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.deposit(mulPrecision(100), {from: victor});
            await stakingContract.withdraw(mulPrecision(150), {from: victor});
            await stakingContract.deposit(mulPrecision(200), {from: victor});

            // check stake of victor
            Helper.assertEqual(mulPrecision(350), await stakingContract.getStakesValue(victor, 1), "stake at epoch 1 should be correct");
            Helper.assertEqual(mulPrecision(550), await stakingContract.getStakesValue(victor, 2), "stake at epoch 2 should be correct");
            Helper.assertEqual(mulPrecision(550), await stakingContract.getLatestStakeBalance(victor), "latest stake balance should be correct");
            // check delegated stake of mike
            Helper.assertEqual(mulPrecision(350), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake at epoch 1 should be correct");
            Helper.assertEqual(mulPrecision(550), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake at epoch 2 should be correct");
            Helper.assertEqual(mulPrecision(550), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake should be correct");
        });

        it("Test withdraw right before starting new epoch", async function() {
            await deployStakingContract(10, currentBlock + 20);

            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
            await stakingContract.deposit(mulPrecision(100), {from: victor});

            await kncToken.transfer(mike, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: mike});
            await stakingContract.deposit(mulPrecision(100), {from: mike});

            await kncToken.transfer(loi, mulPrecision(800));
            await kncToken.approve(stakingContract.address, mulPrecision(800), {from: loi});
            await stakingContract.deposit(mulPrecision(800), {from: loi});

            Helper.assertEqual(0, await stakingContract.getStakes(victor, 0), "stake at epoch 0 is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getStakes(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(800), await stakingContract.getStakes(loi, 1), "stake at epoch 1 is wrong");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[1], startBlock + epochPeriod - currentBlock - 2);
            // withdraw at end of epoch 1
            await stakingContract.withdraw(mulPrecision(600), {from: loi});

            Helper.assertEqual(mulPrecision(100), await stakingContract.getStakes(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getStakes(loi, 1), "stake at epoch 1 is wrong");

            // withdraw at beginning of epoch 2
            await stakingContract.withdraw(mulPrecision(50), {from: victor});

            Helper.assertEqual(mulPrecision(100), await stakingContract.getStakes(victor, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getStakes(victor, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getStakes(loi, 2), "stake at epoch 2 is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getStakes(mike, 2), "stake at epoch 2 is wrong");

            Helper.assertEqual(
                mulPrecision(50), await stakingContract.getLatestStakeBalance(victor), "latest stake is incorrect"
            );
            Helper.assertEqual(
                mulPrecision(200), await stakingContract.getLatestStakeBalance(loi), "latest stake is incorrect"
            );
            Helper.assertEqual(
                mulPrecision(100), await stakingContract.getLatestStakeBalance(mike), "latest stake is incorrect"
            );
        });

        it("Test withdraw data is inited correctly", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
            await stakingContract.deposit(mulPrecision(100), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);

            await stakingContract.withdraw(mulPrecision(10), {from: victor});
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 3), "shouldn't be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 4), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 5), "should be inited data");

            await stakingContract.delegate(mike, {from: victor});

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod);
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 8), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 9), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 8), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 9), "shouldn't be inited data");

            await stakingContract.withdraw(mulPrecision(20), {from: victor});
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

            await stakingContract.withdraw(mulPrecision(20), {from: victor});
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 12), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 13), "should be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 12), "shouldn't be inited data");
            Helper.assertEqual(false, await stakingContract.getHasInitedValue(mike, 13), "shouldn't be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(loi, 12), "should be inited data");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(loi, 13), "should be inited data");
        });

        it("Test withdraw balances change as expected", async function() {
            await deployStakingContract(4, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

            await stakingContract.deposit(mulPrecision(400), {from: victor});

            let expectedUserBal = await kncToken.balanceOf(victor);
            let expectedStakingBal = await kncToken.balanceOf(stakingContract.address);

            await stakingContract.withdraw(mulPrecision(50), {from: victor});
            expectedUserBal.iadd(mulPrecision(50));
            expectedStakingBal.isub(mulPrecision(50));

            Helper.assertEqual(expectedUserBal, await kncToken.balanceOf(victor), "user balance is not changed as expected");
            Helper.assertEqual(expectedStakingBal, await kncToken.balanceOf(stakingContract.address), "staking balance is not changed as expected");

            await stakingContract.withdraw(mulPrecision(100), {from: victor});
            expectedUserBal.iadd(mulPrecision(100));
            expectedStakingBal.isub(mulPrecision(100));

            Helper.assertEqual(expectedUserBal, await kncToken.balanceOf(victor), "user balance is not changed as expected");
            Helper.assertEqual(expectedStakingBal, await kncToken.balanceOf(stakingContract.address), "staking balance is not changed as expected");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 20);
            await stakingContract.withdraw(mulPrecision(100), {from: victor});
            expectedUserBal.iadd(mulPrecision(100));
            expectedStakingBal.isub(mulPrecision(100));

            Helper.assertEqual(expectedUserBal, await kncToken.balanceOf(victor), "user balance is not changed as expected");
            Helper.assertEqual(expectedStakingBal, await kncToken.balanceOf(stakingContract.address), "staking balance is not changed as expected");

            await stakingContract.withdraw(mulPrecision(50), {from: victor});
            expectedUserBal.iadd(mulPrecision(50));
            expectedStakingBal.isub(mulPrecision(50));

            Helper.assertEqual(expectedUserBal, await kncToken.balanceOf(victor), "user balance is not changed as expected");
            Helper.assertEqual(expectedStakingBal, await kncToken.balanceOf(stakingContract.address), "staking balance is not changed as expected");
        });

        it("Test withdraw should call DAO handleWithdrawal as expected", async function() {
            await deployStakingContract(10, currentBlock + 10);
            let dao = await MockKyberDAO.new();
            await stakingContract.updateDAOAddressAndRemoveAdmin(dao.address, {from: admin});

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

            await stakingContract.deposit(mulPrecision(400), {from: victor});
            await stakingContract.withdraw(mulPrecision(10), {from: victor});
            Helper.assertEqual(0, await dao.values(victor), "shouldn't call dao withdrawal func");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod);
            await stakingContract.withdraw(mulPrecision(10), {from: victor});
            Helper.assertEqual(mulPrecision(10), await dao.values(victor), "should call dao withdrawal func");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod * 2 + startBlock - currentBlock);

            await stakingContract.deposit(mulPrecision(20), {from: victor});
            await stakingContract.withdraw(mulPrecision(10), {from: victor});
            Helper.assertEqual(mulPrecision(10), await dao.values(victor), "shouldn't call dao withdrawal func");
            await stakingContract.withdraw(mulPrecision(10), {from: victor});
            Helper.assertEqual(mulPrecision(10), await dao.values(victor), "shouldn't call dao withdrawal func");
            await stakingContract.withdraw(mulPrecision(20), {from: victor});
            Helper.assertEqual(mulPrecision(30), await dao.values(victor), "should call dao withdrawal func");

            await stakingContract.delegate(mike, {from: victor});
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);

            Helper.assertEqual(mulPrecision(30), await dao.values(victor), "dao values should be correct");
            Helper.assertEqual(0, await dao.values(mike), "dao values should be correct");

            await stakingContract.deposit(mulPrecision(10), {from: victor});
            await stakingContract.withdraw(mulPrecision(5), {from: victor});

            Helper.assertEqual(mulPrecision(30), await dao.values(victor), "dao values should be correct");
            Helper.assertEqual(0, await dao.values(mike), "dao values should be correct");

            await stakingContract.withdraw(mulPrecision(20), {from: victor});
            Helper.assertEqual(mulPrecision(30), await dao.values(victor), "dao values should be correct");
            Helper.assertEqual(mulPrecision(15), await dao.values(mike), "dao values should be correct");

            await stakingContract.delegate(loi, {from: victor});
            await stakingContract.withdraw(mulPrecision(10), {from: victor});
            Helper.assertEqual(mulPrecision(30), await dao.values(victor), "dao values should be correct");
            Helper.assertEqual(mulPrecision(25), await dao.values(mike), "dao values should be correct");
            Helper.assertEqual(0, await dao.values(loi), "dao values should be correct");

            // move to next epoch
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 4);

            await stakingContract.withdraw(mulPrecision(10), {from: victor});
            Helper.assertEqual(mulPrecision(30), await dao.values(victor), "dao values should be correct");
            Helper.assertEqual(mulPrecision(25), await dao.values(mike), "dao values should be correct");
            Helper.assertEqual(mulPrecision(10), await dao.values(loi), "dao values should be correct");

            await stakingContract.delegate(victor, {from: victor});
            // move to next epoch
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 4);
            await stakingContract.withdraw(mulPrecision(10), {from: victor});
            Helper.assertEqual(mulPrecision(40), await dao.values(victor), "dao values should be correct");
            Helper.assertEqual(mulPrecision(25), await dao.values(mike), "dao values should be correct");
            Helper.assertEqual(mulPrecision(10), await dao.values(loi), "dao values should be correct");
        });

        it("Test withdraw gas usages", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

            await stakingContract.deposit(mulPrecision(300), {from: victor});
            let tx = await stakingContract.withdraw(mulPrecision(10), {from: victor});
            logInfo("Withdraw no delegation, no DAO : no init epoch data + no penalty amount, gas used: " + tx.receipt.cumulativeGasUsed);

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);
            tx = await stakingContract.withdraw(mulPrecision(10), {from: victor});
            logInfo("Withdraw no delegation, no DAO : init 1 epoch data + has penalty amount, gas used: " + tx.receipt.cumulativeGasUsed);

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);
            tx = await stakingContract.withdraw(mulPrecision(10), {from: victor});
            logInfo("Withdraw no delegation, no DAO : init 2 epoch data + has penalty amount, gas used: " + tx.receipt.cumulativeGasUsed);

            await stakingContract.deposit(mulPrecision(20), {from: victor});
            tx = await stakingContract.withdraw(mulPrecision(30), {from: victor});
            logInfo("Withdraw no delegation, no DAO : without init epoch data + has penalty amount, gas used: " + tx.receipt.cumulativeGasUsed);

            await stakingContract.delegate(mike, {from: victor});
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 6 * epochPeriod + startBlock - currentBlock);
            tx = await stakingContract.withdraw(mulPrecision(10), {from: victor});
            logInfo("Withdraw has delegation, no DAO: init 2 epoch data + has penalty amount, gas used: " + tx.receipt.cumulativeGasUsed);

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            tx = await stakingContract.withdraw(mulPrecision(10), {from: victor});
            logInfo("Withdraw has delegation, no DAO: init 1 epoch data+ has penalty amount, gas used: " + tx.receipt.cumulativeGasUsed);
            tx = await stakingContract.withdraw(mulPrecision(10), {from: victor});
            logInfo("Withdraw has delegation, no DAO: without init epoch data, has penalty amount, gas used: " + tx.receipt.cumulativeGasUsed);

            await stakingContract.deposit(mulPrecision(20), {from: victor});
            tx = await stakingContract.withdraw(mulPrecision(10), {from: victor});
            logInfo("Withdraw has delegation, no DAO: without init epoch data + no penalty amount, gas used: " + tx.receipt.cumulativeGasUsed);

            // Setting dao address
            let dao = await MockKyberDAO.new();
            await stakingContract.updateDAOAddressAndRemoveAdmin(dao.address, {from: admin});

            tx = await stakingContract.withdraw(mulPrecision(20), {from: victor});
            logInfo("Withdraw has delegation, has DAO: without init epoch data + has penalty amount, gas used: " + tx.receipt.cumulativeGasUsed);

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 9 * epochPeriod + startBlock - currentBlock);
            tx = await stakingContract.withdraw(mulPrecision(20), {from: victor});
            logInfo("Withdraw has delegation, has DAO: init 2 epoch data + has penalty amount, gas used: " + tx.receipt.cumulativeGasUsed);
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            tx = await stakingContract.withdraw(mulPrecision(20), {from: victor});
            logInfo("Withdraw has delegation, has DAO: init 1 epoch data + has penalty amount, gas used: " + tx.receipt.cumulativeGasUsed);

            await stakingContract.delegate(victor, {from: victor});
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 12 * epochPeriod + startBlock - currentBlock);
            tx = await stakingContract.withdraw(mulPrecision(20), {from: victor});
            logInfo("Withdraw no delegation, has DAO: init 2 epoch data + has penalty amount, gas used: " + tx.receipt.cumulativeGasUsed);
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            tx = await stakingContract.withdraw(mulPrecision(20), {from: victor});
            logInfo("Withdraw no delegation, has DAO: init 1 epoch data + has penalty amount, gas used: " + tx.receipt.cumulativeGasUsed);
            tx = await stakingContract.withdraw(mulPrecision(20), {from: victor});
            logInfo("Withdraw no delegation, has DAO: no init epoch data + has penalty amount, gas used: " + tx.receipt.cumulativeGasUsed);
        });
    });

    describe("#Delegate Tests", () => {
        it("Test delegate, delegated address and stake change as expected", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

            await stakingContract.delegate(mike, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            await stakingContract.deposit(mulPrecision(50), {from: victor});

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");

            await stakingContract.delegate(loi, {from: victor});

            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");

            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakesValue(loi, 6), "delegated stake is incorrect");

            await stakingContract.deposit(mulPrecision(50), {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 6), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is incorrect");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod - 5);

            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 9), "delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakes(loi, 9), "delegated stake is incorrect");
        });

        it("Test delegate same address many times", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

            await stakingContract.delegate(mike, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            await stakingContract.deposit(mulPrecision(50), {from: victor});

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");

            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod - 3);

            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakes(mike, 10), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
        });

        it("Test delegate, then delegate back to yourself", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

            await stakingContract.delegate(mike, {from: victor});
            await stakingContract.deposit(mulPrecision(50), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakes(mike, 4), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");

            await stakingContract.delegate(victor, {from: victor});

            Helper.assertEqual(victor, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            // delegate back to yourself, shouldn't have any delegated stake
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is incorrect");

            Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
        });

        it("Test delegate after few epochs didn't do anything", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
            await stakingContract.deposit(mulPrecision(100), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is incorrect");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is incorrect");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
        });

        it("Test delegate then deposit more at current + next + after few epochs", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(400));
            await kncToken.approve(stakingContract.address, mulPrecision(400), {from: victor});
            await stakingContract.deposit(mulPrecision(100), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);

            await stakingContract.delegate(mike, {from: victor});
            await stakingContract.deposit(mulPrecision(40), {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(140), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            await stakingContract.deposit(mulPrecision(60), {from: victor});

            Helper.assertEqual(mulPrecision(140), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(mike, 7), "delegated stake is incorrect");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod * 4);
            await stakingContract.deposit(mulPrecision(200), {from: victor});

            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(mike, 10), "delegated stake is incorrect");
            Helper.assertEqual(mulPrecision(400), await stakingContract.getDelegatedStakesValue(mike, 11), "delegated stake is incorrect");
        });

        it("Test delegate from many addresses, stakes change as expected", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(400));
            await kncToken.approve(stakingContract.address, mulPrecision(400), {from: victor});
            await stakingContract.deposit(mulPrecision(100), {from: victor});

            await kncToken.transfer(mike, mulPrecision(400));
            await kncToken.approve(stakingContract.address, mulPrecision(400), {from: mike});
            await stakingContract.deposit(mulPrecision(100), {from: mike});

            await stakingContract.delegate(loi, {from: victor});
            await stakingContract.delegate(loi, {from: mike});

            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(mike), "delegated address is wrong");
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(victor), "delegated address is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod - 4);
            await stakingContract.withdraw(mulPrecision(10), {from: victor});

            Helper.assertEqual(mulPrecision(190), await stakingContract.getDelegatedStakesValue(loi, 4), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(190), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(mike), "delegated address is wrong");
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(victor), "delegated address is wrong");

            await stakingContract.delegate(victor, {from: victor});

            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(mike), "delegated address is wrong");
            Helper.assertEqual(victor, await stakingContract.getLatestDelegatedAddress(victor), "delegated address is wrong");
        });

        it("Test delegate then withdraw, stakes change as expected", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(400));
            await kncToken.approve(stakingContract.address, mulPrecision(400), {from: victor});
            await stakingContract.deposit(mulPrecision(400), {from: victor});

            await stakingContract.delegate(loi, {from: victor});
            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is not correct");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);
            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is not correct");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is not correct");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod - 4);

            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakes(loi, 4), "delegated stake is not correct");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakes(loi, 5), "delegated stake is not correct");

            await stakingContract.withdraw(mulPrecision(10), {from: victor});

            Helper.assertEqual(mulPrecision(190), await stakingContract.getDelegatedStakesValue(loi, 4), "delegated stake is not correct");
            Helper.assertEqual(mulPrecision(190), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is not correct");
            Helper.assertEqual(mulPrecision(190), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");
        });

        it("Test delegate then withdraw after new deposit, stakes change as expected", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(400));
            await kncToken.approve(stakingContract.address, mulPrecision(400), {from: victor});
            await stakingContract.deposit(mulPrecision(300), {from: victor});

            await stakingContract.delegate(loi, {from: victor});
            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is not correct");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);
            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is not correct");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is not correct");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod - 4);

            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakes(loi, 4), "delegated stake is not correct");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakes(loi, 5), "delegated stake is not correct");

            await stakingContract.deposit(mulPrecision(50), {from: victor});
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 4), "delegated stake is not correct");
            Helper.assertEqual(mulPrecision(150), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is not correct");

            await stakingContract.withdraw(mulPrecision(10), {from: victor});

            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 4), "delegated stake is not correct");
            Helper.assertEqual(mulPrecision(140), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is not correct");
            Helper.assertEqual(mulPrecision(140), await stakingContract.getLatestDelegatedStake(loi), "delegated stake is not correct");
        });

        it("Test delegate at end and begin of an epoch", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(400));
            await kncToken.approve(stakingContract.address, mulPrecision(400), {from: victor});
            await stakingContract.deposit(mulPrecision(300), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock - 2);
            // delegate at end of epoch
            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 0), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated address is wrong");
            Helper.assertEqual(victor, await stakingContract.getDelegatedAddressValue(victor, 0), "delegated address is wrong");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);
            // delegate at begin of epoch 2
            await stakingContract.delegate(loi, {from: victor});

            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

            Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(loi, 3), "delegated stake is wrong");

            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 2), "delegated address is wrong");
            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(victor, 3), "delegated address is wrong");
        });

        it("Test delegate circulation, data changes as expect", async function() {
            await deployStakingContract(10, currentBlock + 20);

            await kncToken.transfer(victor, mulPrecision(400));
            await kncToken.approve(stakingContract.address, mulPrecision(400), {from: victor});
            await stakingContract.deposit(mulPrecision(100), {from: victor});

            await kncToken.transfer(mike, mulPrecision(400));
            await kncToken.approve(stakingContract.address, mulPrecision(400), {from: mike});
            await stakingContract.deposit(mulPrecision(200), {from: mike});

            await kncToken.transfer(loi, mulPrecision(400));
            await kncToken.approve(stakingContract.address, mulPrecision(400), {from: loi});
            await stakingContract.deposit(mulPrecision(300), {from: loi});

            await stakingContract.delegate(mike, {from: victor});
            await stakingContract.delegate(loi, {from: mike});
            await stakingContract.delegate(victor, {from: loi});

            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(mike, 1), "delegated address is wrong");
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(mike), "latest delegated address is wrong");

            Helper.assertEqual(mulPrecision(200), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(victor, await stakingContract.getDelegatedAddressValue(loi, 1), "delegated address is wrong");
            Helper.assertEqual(victor, await stakingContract.getLatestDelegatedAddress(loi), "latest delegated address is wrong");

            Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getDelegatedStakesValue(victor, 1), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated address is wrong");
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is wrong");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);

            await stakingContract.deposit(mulPrecision(50), {from: mike});
            Helper.assertEqual(mulPrecision(250), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(300), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

            await stakingContract.withdraw(mulPrecision(50), {from: loi});
            Helper.assertEqual(mulPrecision(250), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStakesValue(victor, 1), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStakesValue(victor, 2), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(250), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod * 4);
            Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStakes(victor, 4), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakes(mike, 4), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStakes(loi, 4), "delegated stake is wrong");

            await stakingContract.delegate(mike, {from: loi});
            Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStakesValue(victor, 5), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 5), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStakesValue(loi, 5), "delegated stake is wrong");

            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(victor, 6), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(350), await stakingContract.getDelegatedStakesValue(mike, 6), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(250), await stakingContract.getDelegatedStakesValue(loi, 6), "delegated stake is wrong");
        });

        it("Test delegate, then delegate to another, deposit + withdraw stakes change as expected", async function() {
            await deployStakingContract(10, currentBlock + 20);

            await kncToken.transfer(victor, mulPrecision(400));
            await kncToken.approve(stakingContract.address, mulPrecision(400), {from: victor});
            await stakingContract.deposit(mulPrecision(100), {from: victor});

            await stakingContract.delegate(mike, {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            await stakingContract.delegate(loi, {from: victor});
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated address is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(victor, 2), "delegated address is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");

            await stakingContract.deposit(mulPrecision(100), {from: victor});
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated address is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(victor, 2), "delegated address is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(200), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");

            await stakingContract.withdraw(mulPrecision(150), {from: victor});
            Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakesValue(mike, 1), "delegated stake is wrong");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddressValue(victor, 1), "delegated address is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(mike, 2), "delegated stake is wrong");

            Helper.assertEqual(loi, await stakingContract.getDelegatedAddressValue(victor, 2), "delegated address is wrong");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakesValue(loi, 1), "delegated stake is wrong");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakesValue(loi, 2), "delegated stake is wrong");
        });

        it("Test delegate data is inited correctly", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

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

        it("Test delegate gas usages", async function() {
            await deployStakingContract(5, currentBlock + 5);

            let tx = await stakingContract.delegate(mike, {from: victor});
            logInfo("Delegate no stake: init 2 epochs data + from self to mike, gas used: " + tx.receipt.cumulativeGasUsed);
            await stakingContract.delegate(victor, {from: victor});
            // jump to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);
            tx = await stakingContract.delegate(mike, {from: victor});
            logInfo("Delegate no stake: init 1 epoch data + from self to mike, gas used: " + tx.receipt.cumulativeGasUsed);
            await stakingContract.delegate(victor, {from: victor});
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            // to make init 2 epochs data
            await stakingContract.delegate(victor, {from: victor});
            tx = await stakingContract.delegate(loi, {from: victor});
            logInfo("Delegate no stake: no init epoch data + from self to mike, gas used: " + tx.receipt.cumulativeGasUsed);
            tx = await stakingContract.delegate(loi, {from: victor});
            logInfo("Delegate no stake: no init epoch data + same delegated, gas used: " + tx.receipt.cumulativeGasUsed);
            tx = await stakingContract.delegate(loi, {from: victor});
            logInfo("Delegate no stake: no init epoch data + back to self, gas used: " + tx.receipt.cumulativeGasUsed);

            await stakingContract.delegate(victor, {from: victor});

            // make deposit
            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
            await stakingContract.deposit(mulPrecision(10), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 4 * epochPeriod + startBlock - currentBlock);
            tx = await stakingContract.delegate(mike, {from: victor});
            logInfo("Delegate has stake: init 2 epochs data + from self to mike, gas used: " + tx.receipt.cumulativeGasUsed);
            await stakingContract.delegate(victor, {from: victor});
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            tx = await stakingContract.delegate(mike, {from: victor});
            logInfo("Delegate has stake: init 1 epoch data + from self to mike, gas used: " + tx.receipt.cumulativeGasUsed);
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            // to make init 2 epochs data
            await stakingContract.delegate(victor, {from: victor});
            tx = await stakingContract.delegate(loi, {from: victor});
            logInfo("Delegate has stake: no init epoch data + from self to mike, gas used: " + tx.receipt.cumulativeGasUsed);

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 8 * epochPeriod + startBlock - currentBlock);
            tx = await stakingContract.delegate(mike, {from: victor});
            logInfo("Delegate has stake: init 2 epochs data + from mike to loi, gas used: " + tx.receipt.cumulativeGasUsed);
            await stakingContract.delegate(victor, {from: victor});
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            tx = await stakingContract.delegate(mike, {from: victor});
            logInfo("Delegate has stake: init 1 epoch data + from mike to loi, gas used: " + tx.receipt.cumulativeGasUsed);
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod - 1);
            // to make init 2 epochs data
            await stakingContract.delegate(victor, {from: victor});
            tx = await stakingContract.delegate(loi, {from: victor});
            logInfo("Delegate has stake: no init epoch data + from mike to loi, gas used: " + tx.receipt.cumulativeGasUsed);

            tx = await stakingContract.delegate(loi, {from: victor});
            logInfo("Delegate has stake: same delegated address, gas used: " + tx.receipt.cumulativeGasUsed);
            tx = await stakingContract.delegate(victor, {from: victor});
            logInfo("Delegate has stake: back to self, gas used: " + tx.receipt.cumulativeGasUsed);
        });
    });

    describe("#GetFunctions Tests", () => {
        it("Test get functions return default value when calling epoch > current epoch + 1", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
            await stakingContract.deposit(mulPrecision(50), {from: victor});

            Helper.assertEqual(0, await stakingContract.getStakes(victor, 100), "get stakes should return 0");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakes(victor, 100), "get stakes should return 0");
            Helper.assertEqual(zeroAddress, await stakingContract.getDelegatedAddress(victor, 100), "get stakes should return 0");
        });

        it("Test getStakes return correct data", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(200));
            await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});
            await stakingContract.deposit(mulPrecision(50), {from: victor});

            Helper.assertEqual(0, await stakingContract.getStakes(victor, 0), "get stakes should return 0");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getStakes(victor, 1), "get stakes should return correct data");

            await stakingContract.deposit(mulPrecision(20), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);

            // get data current + next epoch
            Helper.assertEqual(mulPrecision(70), await stakingContract.getStakes(victor, 4), "get stakes should return correct data");
            Helper.assertEqual(mulPrecision(70), await stakingContract.getStakes(victor, 5), "get stakes should return correct data");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 6 * epochPeriod);

            // get data for pass epoch
            Helper.assertEqual(mulPrecision(70), await stakingContract.getStakes(victor, 7), "get stakes should return correct data");
            Helper.assertEqual(mulPrecision(70), await stakingContract.getStakes(victor, 8), "get stakes should return correct data");

            await stakingContract.deposit(mulPrecision(30), {from: victor});

            // get data for past epoch
            Helper.assertEqual(mulPrecision(70), await stakingContract.getStakes(victor, 7), "get stakes should return correct data");
            Helper.assertEqual(mulPrecision(70), await stakingContract.getStakes(victor, 8), "get stakes should return correct data");

            // get data for current epoch
            Helper.assertEqual(mulPrecision(70), await stakingContract.getStakes(victor, 10), "get stakes should return correct data");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getStakes(victor, 11), "get stakes should return correct data");
        });

        it("Test getDelegatedStakes return correct data", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(200));
            await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});
            await stakingContract.deposit(mulPrecision(50), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(0, await stakingContract.getDelegatedStakes(victor, 0), "get delegated stakes should return 0");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakes(victor, 1), "get delegated stakes should return correct data");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakes(mike, 0), "get delegated stakes should return 0");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getDelegatedStakes(mike, 1), "get delegated stakes should return correct data");

            await stakingContract.deposit(mulPrecision(20), {from: victor});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);

            // get data current + next epoch
            Helper.assertEqual(mulPrecision(70), await stakingContract.getDelegatedStakes(mike, 4), "get delegated stakes should return correct data");
            Helper.assertEqual(mulPrecision(70), await stakingContract.getDelegatedStakes(mike, 5), "get delegated stakes should return correct data");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 6 * epochPeriod - 2);

            // get data for past epoch
            Helper.assertEqual(mulPrecision(70), await stakingContract.getDelegatedStakes(mike, 8), "get delegated stakes should return correct data");

            await stakingContract.deposit(mulPrecision(30), {from: victor});

            // get data for pass epoch
            Helper.assertEqual(mulPrecision(70), await stakingContract.getDelegatedStakes(mike, 8), "get delegated stakes should return correct data");

            // get data for current + next epoch
            Helper.assertEqual(mulPrecision(70), await stakingContract.getDelegatedStakes(mike, 9), "get delegated stakes should return correct data");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakes(mike, 10), "get delegated stakes should return correct data");

            await stakingContract.delegate(loi, {from: victor});
            // get data for pass epoch
            Helper.assertEqual(0, await stakingContract.getDelegatedStakes(loi, 8), "get delegated stakes should return correct data");
            Helper.assertEqual(mulPrecision(70), await stakingContract.getDelegatedStakes(mike, 8), "get delegated stakes should return correct data");

            // get data for current epoch
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakes(mike, 10), "get delegatedstakes should return correct data");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakes(mike, 11), "get delegatedstakes should return correct data");
            Helper.assertEqual(0, await stakingContract.getDelegatedStakes(loi, 10), "get delegated stakes should return correct data");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getDelegatedStakes(loi, 11), "get delegated stakes should return correct data");
        });

        it("Test getDelegatedAddress return correct data", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(200));
            await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});
            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(victor, await stakingContract.getDelegatedAddress(victor, 0), "get delegated address should return correct data");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddress(victor, 1), "get delegated address should return correct data");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);

            // get data current + next epoch
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddress(victor, 4), "get delegated address should return correct data");
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddress(victor, 5), "get delegated address should return correct data");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 6 * epochPeriod);

            // get data for past epoch
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddress(mike, 7), "get delegated address should return correct data");

            await stakingContract.delegate(loi, {from: victor});
            // get data for pass epoch
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddress(victor, 7), "get delegated address should return correct data");

            // get data for current epoch
            Helper.assertEqual(mike, await stakingContract.getDelegatedAddress(victor, 10), "get delegated address should return correct data");
            Helper.assertEqual(loi, await stakingContract.getDelegatedAddress(victor, 11), "get delegated address should return correct data");
        });

        it("Test getStakes return correct data", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(200));
            await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});
            await kncToken.transfer(mike, mulPrecision(200));
            await kncToken.approve(stakingContract.address, mulPrecision(200), {from: mike});

            let data = await stakingContract.getStakerDataForPastEpoch(victor, 0);
            Helper.assertEqual(0, data[0], "stake is wrong");
            Helper.assertEqual(0, data[1], "delegated stake is wrong");
            Helper.assertEqual(zeroAddress, data[2], "delegated address is wrong");

            await stakingContract.deposit(mulPrecision(50), {from: victor});

            data = await stakingContract.getStakerDataForPastEpoch(victor, 0);
            Helper.assertEqual(0, data[0], "stake is wrong");
            Helper.assertEqual(0, data[1], "delegated stake is wrong");
            Helper.assertEqual(victor, data[2], "delegated address is wrong");

            data = await stakingContract.getStakerDataForPastEpoch(victor, 1);
            Helper.assertEqual(mulPrecision(50), data[0], "stake is wrong");
            Helper.assertEqual(0, data[1], "delegated stake is wrong");
            Helper.assertEqual(victor, data[2], "delegated address is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 6);
            await stakingContract.deposit(mulPrecision(20), {from: victor});

            data = await stakingContract.getStakerDataForPastEpoch(victor, 1);
            Helper.assertEqual(mulPrecision(50), data[0], "stake is wrong");
            data = await stakingContract.getStakerDataForPastEpoch(victor, 2);
            Helper.assertEqual(mulPrecision(70), data[0], "stake is wrong");

            data = await stakingContract.getStakerDataForPastEpoch(victor, 3);
            // not inited yet
            Helper.assertEqual(0, data[0], "stake is wrong");
            Helper.assertEqual(0, data[1], "delegated stake is wrong");
            Helper.assertEqual(zeroAddress, data[2], "delegated address is wrong");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 6 * epochPeriod + startBlock - currentBlock);

            data = await stakingContract.getStakerDataForPastEpoch(victor, 4);
            // not inited yet
            Helper.assertEqual(0, data[0], "stake is wrong");
            Helper.assertEqual(0, data[1], "delegated stake is wrong");
            Helper.assertEqual(zeroAddress, data[2], "delegated address is wrong");

            await stakingContract.delegate(mike, {from: victor});
            data = await stakingContract.getStakerDataForPastEpoch(mike, 7);
            Helper.assertEqual(0, data[0], "stake is wrong");
            Helper.assertEqual(0, data[1], "delegated stake is wrong");
            Helper.assertEqual(mike, data[2], "delegated address is wrong");
            data = await stakingContract.getStakerDataForPastEpoch(mike, 8);
            Helper.assertEqual(0, data[0], "stake is wrong");
            Helper.assertEqual(mulPrecision(70), data[1], "delegated stake is wrong");
            Helper.assertEqual(mike, data[2], "delegated address is wrong");

            await stakingContract.deposit(mulPrecision(100), {from: mike});
            data = await stakingContract.getStakerDataForPastEpoch(mike, 8);
            Helper.assertEqual(mulPrecision(100), data[0], "stake is wrong");
            Helper.assertEqual(mulPrecision(70), data[1], "delegated stake is wrong");
            Helper.assertEqual(mike, data[2], "delegated address is wrong");

            data = await stakingContract.getStakerDataForPastEpoch(victor, 8);
            Helper.assertEqual(mulPrecision(70), data[0], "stake is wrong");
            Helper.assertEqual(0, data[1], "delegated stake is wrong");
            Helper.assertEqual(mike, data[2], "delegated address is wrong");

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 7 * epochPeriod + startBlock - currentBlock);

            await stakingContract.delegate(loi, {from: victor});

            data = await stakingContract.getStakerDataForPastEpoch(mike, 8);
            Helper.assertEqual(mulPrecision(100), data[0], "stake is wrong");
            Helper.assertEqual(mulPrecision(70), data[1], "delegated stake is wrong");
            Helper.assertEqual(mike, data[2], "delegated address is wrong");

            data = await stakingContract.getStakerDataForPastEpoch(mike, 9);
            Helper.assertEqual(mulPrecision(100), data[0], "stake is wrong");
            Helper.assertEqual(0, data[1], "delegated stake is wrong");
            Helper.assertEqual(mike, data[2], "delegated address is wrong");

            data = await stakingContract.getStakerDataForPastEpoch(loi, 8);
            Helper.assertEqual(0, data[1], "delegated stake is wrong");

            data = await stakingContract.getStakerDataForPastEpoch(loi, 9);
            Helper.assertEqual(mulPrecision(70), data[1], "delegated stake is wrong");

            data = await stakingContract.getStakerDataForPastEpoch(victor, 8);
            Helper.assertEqual(0, data[1], "delegated stake is wrong");
            Helper.assertEqual(mike, data[2], "delegated address is wrong");

            data = await stakingContract.getStakerDataForPastEpoch(victor, 9);
            Helper.assertEqual(0, data[1], "delegated stake is wrong");
            Helper.assertEqual(loi, data[2], "delegated address is wrong");
        });

        it("Test get latest stakes returns correct data", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(200));
            await kncToken.approve(stakingContract.address, mulPrecision(200), {from: victor});

            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");

            await stakingContract.deposit(mulPrecision(10), {from: victor});
            Helper.assertEqual(mulPrecision(10), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 20);
            Helper.assertEqual(mulPrecision(10), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");

            await stakingContract.deposit(mulPrecision(20), {from: victor});
            Helper.assertEqual(mulPrecision(30), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");
            await stakingContract.withdraw(mulPrecision(5), {from: victor});
            Helper.assertEqual(mulPrecision(25), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");
            await stakingContract.deposit(mulPrecision(15), {from: victor});
            Helper.assertEqual(mulPrecision(40), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");
            await stakingContract.withdraw(mulPrecision(30), {from: victor});
            Helper.assertEqual(mulPrecision(10), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 35);
            await stakingContract.withdraw(mulPrecision(10), {from: victor});
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");
            await stakingContract.deposit(mulPrecision(20), {from: victor});
            Helper.assertEqual(mulPrecision(20), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");

            await stakingContract.delegate(mike, {from: victor});
            Helper.assertEqual(mulPrecision(20), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(mike), "latest stake is wrong");

            await stakingContract.deposit(mulPrecision(10), {from: victor});
            Helper.assertEqual(mulPrecision(30), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(mike), "latest stake is wrong");

            await stakingContract.delegate(loi, {from: victor});
            Helper.assertEqual(mulPrecision(30), await stakingContract.getLatestStakeBalance(victor), "latest stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(loi), "latest stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestStakeBalance(mike), "latest stake is wrong");
        });

        it("Test get latest delegated stakes returns correct data", async function() {
            await deployStakingContract(6, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

            await kncToken.transfer(mike, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: mike});

            await kncToken.transfer(loi, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: loi});

            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

            await stakingContract.deposit(mulPrecision(50), {from: victor});
            await stakingContract.deposit(mulPrecision(60), {from: loi});
            await stakingContract.deposit(mulPrecision(70), {from: mike});

            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

            await stakingContract.delegate(mike, {from: victor});
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 25);
            await stakingContract.delegate(loi, {from: victor});
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

            await stakingContract.deposit(mulPrecision(50), {from: victor});
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

            await stakingContract.withdraw(mulPrecision(20), {from: victor});
            Helper.assertEqual(mulPrecision(80), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 25);
            await stakingContract.delegate(mike, {from: loi});
            await stakingContract.delegate(victor, {from: mike});
            Helper.assertEqual(mulPrecision(80), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(70), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(60), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 25);
            await stakingContract.deposit(mulPrecision(30), {from: mike});
            Helper.assertEqual(mulPrecision(80), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(60), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");

            await stakingContract.withdraw(mulPrecision(10), {from: loi});
            Helper.assertEqual(mulPrecision(80), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");

            await stakingContract.delegate(mike, {from: mike});
            Helper.assertEqual(mulPrecision(80), await stakingContract.getLatestDelegatedStake(loi), "latest delegated stake is wrong");
            Helper.assertEqual(0, await stakingContract.getLatestDelegatedStake(victor), "latest delegated stake is wrong");
            Helper.assertEqual(mulPrecision(50), await stakingContract.getLatestDelegatedStake(mike), "latest delegated stake is wrong");
        });

        it("Test get delegated address should return correct data", async function() {
            await deployStakingContract(6, currentBlock + 10);

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(mike), "latest delegated address is wrong");
            Helper.assertEqual(victor, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is wrong");
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(loi), "latest delegated address is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 20);
            await stakingContract.delegate(mike, {from: victor});

            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(mike), "latest delegated address is wrong");
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is wrong");
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(loi), "latest delegated address is wrong");

            await stakingContract.delegate(victor, {from: loi});
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(mike), "latest delegated address is wrong");
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is wrong");
            Helper.assertEqual(victor, await stakingContract.getLatestDelegatedAddress(loi), "latest delegated address is wrong");

            await stakingContract.delegate(mike, {from: loi});
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(mike), "latest delegated address is wrong");
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is wrong");
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(loi), "latest delegated address is wrong");

            await stakingContract.delegate(loi, {from: mike});
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(mike), "latest delegated address is wrong");
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is wrong");
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(loi), "latest delegated address is wrong");

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 25);
            Helper.assertEqual(loi, await stakingContract.getLatestDelegatedAddress(mike), "latest delegated address is wrong");
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is wrong");
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(loi), "latest delegated address is wrong");

            await stakingContract.delegate(mike, {from: mike});
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(mike), "latest delegated address is wrong");
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is wrong");
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(loi), "latest delegated address is wrong");

            await stakingContract.delegate(victor, {from: mike});
            Helper.assertEqual(victor, await stakingContract.getLatestDelegatedAddress(mike), "latest delegated address is wrong");
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(victor), "latest delegated address is wrong");
            Helper.assertEqual(mike, await stakingContract.getLatestDelegatedAddress(loi), "latest delegated address is wrong");
        });

        it("Test get staker data for current epoch called by DAO", async function() {
            await deployStakingContract(15, currentBlock + 15);
            let dao = accounts[8];
            await stakingContract.updateDAOAddressAndRemoveAdmin(dao, {from: admin});

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

            await kncToken.transfer(mike, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: mike});

            await kncToken.transfer(loi, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: loi});

            await stakingContract.checkInitAndReturnStakerDataForCurrentEpoch(victor, 0, 0, victor, {from: dao});

            await stakingContract.deposit(mulPrecision(100), {from: victor});
            await stakingContract.checkInitAndReturnStakerDataForCurrentEpoch(victor, 0, 0, victor, {from: dao});

            currentBlock = await Helper.getCurrentBlock();
            // delay to epoch 2
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod + startBlock - currentBlock);

            Helper.assertEqual(false, await stakingContract.getHasInitedValue(victor, 2), "shouldn't inited value for epoch 2");

            // victor: stake (100), delegated stake (0), delegated address (victor)
            await stakingContract.checkInitAndReturnStakerDataForCurrentEpoch(
                victor, mulPrecision(100), 0, victor, {from: dao}
            );
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 2), "should inited value for epoch 2");
            Helper.assertEqual(true, await stakingContract.getHasInitedValue(victor, 3), "should inited value for epoch 3");

            await stakingContract.delegate(mike, {from: victor});
            // victor: stake (100), delegated stake (0), delegated address (victor)
            await stakingContract.checkInitAndReturnStakerDataForCurrentEpoch(
                victor, mulPrecision(100), 0, victor, {from: dao}
            );

            // mike: stake (0), delegated stake (0), delegated address (mike)
            await stakingContract.checkInitAndReturnStakerDataForCurrentEpoch(
                mike, 0, 0, mike, {from: dao}
            );

            await stakingContract.deposit(mulPrecision(200), {from: mike});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2 * epochPeriod + startBlock - currentBlock);

            // victor: stake (100), delegated stake (0), delegated address (mike)
            await stakingContract.checkInitAndReturnStakerDataForCurrentEpoch(
                victor, mulPrecision(100), 0, mike, {from: dao}
            );

            // mike: stake (200), delegated stake (100), delegated address (mike)
            await stakingContract.checkInitAndReturnStakerDataForCurrentEpoch(
                mike, mulPrecision(200), mulPrecision(100), mike, {from: dao}
            );

            await stakingContract.delegate(loi, {from: victor});

            // mike: stake (200), delegated stake (100), delegated address (mike)
            await stakingContract.checkInitAndReturnStakerDataForCurrentEpoch(
                mike, mulPrecision(200), mulPrecision(100), mike, {from: dao}
            );
            // loi: stake (0), delegated stake (0), delegated address (loi)
            await stakingContract.checkInitAndReturnStakerDataForCurrentEpoch(
                loi, 0, 0, loi, {from: dao}
            );

            await stakingContract.deposit(mulPrecision(10), {from: victor});
            // loi: stake (0), delegated stake (0), delegated address (loi)
            stakingContract.checkInitAndReturnStakerDataForCurrentEpoch(
                loi, 0, 0, loi, {from: dao}
            );

            // mike: stake (200), delegated stake (100), delegated address (mike)
            await stakingContract.checkInitAndReturnStakerDataForCurrentEpoch(
                mike, mulPrecision(200), mulPrecision(100), mike, {from: dao}
            );

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3 * epochPeriod + startBlock - currentBlock);

            // mike: stake (200), delegated stake (0), delegated address (mike)
            await stakingContract.checkInitAndReturnStakerDataForCurrentEpoch(
                mike, mulPrecision(200), 0, mike, {from: dao}
            );

            // loi: stake (0), delegated stake (90), delegated address (loi)
            await stakingContract.checkInitAndReturnStakerDataForCurrentEpoch(
                loi, 0, mulPrecision(110), loi, {from: dao}
            );
        });
    });

    describe("#Revert Tests", () => {
        it("Test update DAO address should revert when sender is not admin or dao address is zero", async function() {
            await deployStakingContract(10, currentBlock + 10);
            let dao = await MockKyberDAO.new();
            try {
                await stakingContract.updateDAOAddressAndRemoveAdmin(zeroAddress, {from: admin});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            try {
                await stakingContract.updateDAOAddressAndRemoveAdmin(dao.address, {from: mike});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await stakingContract.updateDAOAddressAndRemoveAdmin(dao.address, {from: admin});
            try {
                await stakingContract.updateDAOAddressAndRemoveAdmin(dao.address, {from: admin});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });

        it("Test constructor should revert with invalid arguments", async function() {
            try {
                stakingContract = await StakingContract.new(zeroAddress, 20, currentBlock + 10, admin)
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            try {
                stakingContract = await StakingContract.new(kncToken.address, 0, currentBlock + 10, admin)
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            try {
                stakingContract = await StakingContract.new(kncToken.address, 20, currentBlock - 1, admin)
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            try {
                stakingContract = await StakingContract.new(kncToken.address, 20, currentBlock + 10, zeroAddress)
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            stakingContract = await StakingContract.new(kncToken.address, 20, currentBlock + 10, admin)
        });

        it("Test deposit should revert when amount is 0", async function() {
            await deployStakingContract(6, currentBlock + 6);

            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});

            try {
                await stakingContract.deposit(0, {from: victor});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await stakingContract.deposit(mulPrecision(90), {from: victor});
        });

        it("Test deposit should revert when not enough balance or allowance", async function() {
            await deployStakingContract(10, currentBlock + 10);

            // has 100 tokens, approve enough but try to deposit more
            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
            try {
                await stakingContract.deposit(mulPrecision(200), {from: victor});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await stakingContract.deposit(mulPrecision(90), {from: victor});
            await stakingContract.deposit(mulPrecision(10), {from: victor});

            // has more tokens, approve small amounts and try to deposit more than allowances
            await kncToken.transfer(mike, mulPrecision(1000));
            // not approve yet, should revert
            try {
                await stakingContract.deposit(mulPrecision(100), {from: mike});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            // approve and deposit more than allowance
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: mike});
            try {
                await stakingContract.deposit(mulPrecision(200), {from: mike});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            // total deposit more than allowances
            await stakingContract.deposit(mulPrecision(50), {from: mike});
            try {
                await stakingContract.deposit(mulPrecision(51), {from: mike});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            await stakingContract.deposit(mulPrecision(50), {from: mike});
        });

        it("Test get staker data for current epoch should revert when sender is not dao", async function() {
            await deployStakingContract(10, currentBlock + 10);
            try {
                await stakingContract.initAndReturnStakerDataForCurrentEpoch(mike, {from: mike});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            try {
                await stakingContract.initAndReturnStakerDataForCurrentEpoch(mike, {from: admin});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await stakingContract.updateDAOAddressAndRemoveAdmin(mike, {from: admin});
            try {
                await stakingContract.initAndReturnStakerDataForCurrentEpoch(mike, {from: admin});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await stakingContract.initAndReturnStakerDataForCurrentEpoch(mike, {from: mike});
        });

        it("Test withdraw should revert when amount more than current deposited amount", async function() {
            await deployStakingContract(10, currentBlock + 20);

            await kncToken.transfer(victor, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: victor});
            await stakingContract.deposit(mulPrecision(100), {from: victor});

            await kncToken.transfer(mike, mulPrecision(100));
            await kncToken.approve(stakingContract.address, mulPrecision(100), {from: mike});
            await stakingContract.deposit(mulPrecision(100), {from: mike});

            await kncToken.transfer(loi, mulPrecision(800));
            await kncToken.approve(stakingContract.address, mulPrecision(800), {from: loi});
            await stakingContract.deposit(mulPrecision(800), {from: loi});

            Helper.assertEqual(0, await stakingContract.getStakes(victor, 0), "stake at epoch 0 is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getStakes(victor, 1), "stake at epoch 0 is wrong");
            Helper.assertEqual(mulPrecision(800), await stakingContract.getStakes(loi, 1), "stake at epoch 1 is wrong");

            try {
                await stakingContract.withdraw(mulPrecision(900), {from: loi});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            Helper.assertEqual(0, await stakingContract.getStakes(victor, 0), "stake at epoch 0 is wrong");
            Helper.assertEqual(0, await stakingContract.getStakes(loi, 0), "stake at epoch 0 is wrong");
            Helper.assertEqual(0, await stakingContract.getStakes(victor, 1), "stake at epoch 1 is wrong");

            Helper.assertEqual(mulPrecision(800), await stakingContract.getStakes(loi, 1), "stake at epoch 1 is wrong");
            Helper.assertEqual(mulPrecision(100), await stakingContract.getStakes(mike, 1), "stake at epoch 1 is wrong");

            Helper.assertEqual(
                0, await stakingContract.getLatestStakeBalance(victor), "latest stake is incorrect"
            );
            Helper.assertEqual(
                mulPrecision(800), await stakingContract.getLatestStakeBalance(loi), "latest stake is incorrect"
            );
            Helper.assertEqual(
                mulPrecision(100), await stakingContract.getLatestStakeBalance(mike), "latest stake is incorrect"
            );
        });

        it("Test withdraw should revert when no stakes but has delegated stake", async function() {
            await deployStakingContract(10, currentBlock + 10);

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});
            await stakingContract.deposit(mulPrecision(100), {from: victor});

            await stakingContract.delegate(mike, {from: victor});
            await stakingContract.deposit(mulPrecision(200), {from: victor});

            // mike can not withdraw
            try {
                await stakingContract.withdraw(mulPrecision(100), {from: mike});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            // victor can withdraw
            await stakingContract.withdraw(mulPrecision(100), {from: victor});
        });

        it("Test withdraw should revert when handleWithdrawal in DAO reverted", async function() {
            await deployStakingContract(10, currentBlock + 10);
            let dao = await MockDAOWithdrawFailed.new();
            await stakingContract.updateDAOAddressAndRemoveAdmin(dao.address, {from: admin});

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

            await stakingContract.deposit(mulPrecision(500), {from: victor});

            // shouldn't call withdraw from dao
            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod);
            try {
                await stakingContract.withdraw(mulPrecision(100), {from: victor});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });

        it("Test withdraw should revert when DAO does not have handleWithdrawl func", async function() {
            await deployStakingContract(10, currentBlock + 10);
            await stakingContract.updateDAOAddressAndRemoveAdmin(accounts[8], {from: admin});

            await kncToken.transfer(victor, mulPrecision(500));
            await kncToken.approve(stakingContract.address, mulPrecision(500), {from: victor});

            await stakingContract.deposit(mulPrecision(500), {from: victor});

            // shouldn't call withdraw from dao
            await stakingContract.withdraw(mulPrecision(100), {from: victor});
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], epochPeriod);

            try {
                await stakingContract.withdraw(mulPrecision(100), {from: victor});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });

        it("Test delegate should revert when delegate to address 0", async function() {
            await deployStakingContract(2, currentBlock + 2);
            await stakingContract.updateDAOAddressAndRemoveAdmin(accounts[8], {from: admin});

            try {
                await stakingContract.delegate(zeroAddress, {from: victor});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await stakingContract.delegate(mike, {from: victor});
        });
    });
});

function logInfo(message) {
    console.log("           " + message);
}

function mulPrecision(value) {
    return precision.mul(new BN(value));
}
