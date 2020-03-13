pragma solidity 0.5.11;


import "../IERC20.sol";
import "../utils/zeppelin/ReentrancyGuard.sol";
import "./IKyberStaking.sol";
import "../IKyberDAO.sol";
import "./EpochUtils.sol";


/*
* This contract is using SafeMath for uint, which is inherited from EpochUtils
*/
contract KyberStaking is IKyberStaking, EpochUtils, ReentrancyGuard {

    // amount KNC staked of an address for each epoch
    mapping(uint => mapping(address => uint)) internal stake;
    // the latest KNC staked of an address
    mapping(address => uint) internal latestStake;

    // amount of KNC that other people has delegated to an address at each epoch
    mapping(uint => mapping(address => uint)) internal delegatedStake;
    // similar to latest stake balance but for delegated stake
    mapping(address => uint) internal latestDelegatedStake;

    // delegated address of an address at each epoch
    mapping(uint => mapping(address => address)) internal delegatedAddress;
    // latest delegated address of an address
    mapping(address => address) internal latestDelegatedAddress;

    // bool for control if we have init data for an epoch + an address
    mapping(uint => mapping(address => bool)) internal hasInited;

    IERC20 public kncToken;
    IKyberDAO public daoContract;
    address public daoContractSetter;

    constructor(address _kncToken, uint _epochPeriod, uint _startBlock, address _daoContractSetter) public {
        require(_epochPeriod > 0, "ctor: epoch duration must be positive");
        require(_startBlock >= block.number, "ctor: start block should not be in the past");
        require(_kncToken != address(0), "ctor: KNC address is missing");
        require(_daoContractSetter != address(0), "ctor: daoContractSetter address is missing");

        EPOCH_PERIOD_BLOCKS = _epochPeriod;
        FIRST_EPOCH_START_BLOCK = _startBlock;
        kncToken = IERC20(_kncToken);
        daoContractSetter = _daoContractSetter;
    }

    modifier onlyDAOContractSetter() {
        require(msg.sender == daoContractSetter, "sender is not daoContractSetter");
        _;
    }

    event DAOAddressSet(address _daoAddress);

    event DAOContractSetterRemoved();

    /**
    * @dev update DAO address and set daoSetter to zero address, can only call once
    * @param _daoAddress address of new DAO
    */
    function updateDAOAddressAndRemoveSetter(address _daoAddress) public onlyDAOContractSetter {
        require(_daoAddress != address(0), "updateDAO: DAO address is missing");

        daoContract = IKyberDAO(_daoAddress);
        // verify the same epoch period + start block
        require(daoContract.EPOCH_PERIOD_BLOCKS() == EPOCH_PERIOD_BLOCKS, "updateDAO: DAO and Staking have different epoch period");
        require(daoContract.FIRST_EPOCH_START_BLOCK() == FIRST_EPOCH_START_BLOCK, "updateDAO: DAO and Staking have different start block");

        emit DAOAddressSet(_daoAddress);

        // reset dao contract setter
        daoContractSetter = address(0);
        emit DAOContractSetterRemoved();
    }

    event Delegated(address staker, address dAddr, uint epoch, bool isDelegated);

    /**
    * @dev calls to set delegation for msg.sender, will take effect from the next epoch
    * @param dAddr address to delegate to
    */
    function delegate(address dAddr) public returns(bool) {
        require(dAddr != address(0), "delegate: delegated address should not be 0x0");
        address staker = msg.sender;
        uint curEpoch = getCurrentEpochNumber();

        initDataIfNeeded(staker, curEpoch);

        address curDAddr = delegatedAddress[curEpoch + 1][staker];
        // nothing changes here
        if (dAddr == curDAddr) { return false; }

        uint updatedStake = stake[curEpoch + 1][staker];

        // reduce delegatedStake for curDelegatedAddr if needed
        if (curDAddr != staker) {
            initDataIfNeeded(curDAddr, curEpoch);
            // by right we don't need to check if delegatedStake >= stake
            require(
                delegatedStake[curEpoch + 1][curDAddr] >= updatedStake,
                "delegate: delegated stake is smaller than next epoch stake"
            );
            require(
                latestDelegatedStake[curDAddr] >= updatedStake,
                "delegate: latest delegated stake is smaller than next epoch stake"
            );

            delegatedStake[curEpoch + 1][curDAddr] = delegatedStake[curEpoch + 1][curDAddr].sub(updatedStake);
            latestDelegatedStake[curDAddr] = latestDelegatedStake[curDAddr].sub(updatedStake);

            emit Delegated(staker, curDAddr, curEpoch, false);
        }

        latestDelegatedAddress[staker] = dAddr;
        delegatedAddress[curEpoch + 1][staker] = dAddr;

        // ignore if S delegated back to himself
        if (dAddr != staker) {
            initDataIfNeeded(dAddr, curEpoch);
            delegatedStake[curEpoch + 1][dAddr] = delegatedStake[curEpoch + 1][dAddr].add(updatedStake);
            latestDelegatedStake[dAddr] = latestDelegatedStake[dAddr].add(updatedStake);
        }

        emit Delegated(staker, dAddr, curEpoch, true);
    }

    event Deposited(uint curEpoch, address staker, uint amount);

    /**
    * @dev call to stake more KNC for msg.sender
    * @param amount amount of KNC to stake
    */
    function deposit(uint amount) public {
        require(amount > 0, "deposit: amount to deposit should be positive");
        // compute epoch number
        uint curEpoch = getCurrentEpochNumber();
        address staker = msg.sender;

        // collect KNC token from sender
        require(kncToken.transferFrom(staker, address(this), amount), "deposit: can not get token");

        initDataIfNeeded(staker, curEpoch);

        stake[curEpoch + 1][staker] = stake[curEpoch + 1][staker].add(amount);
        latestStake[staker] = latestStake[staker].add(amount);

        // increase delegated stake for address that S has delegated to (if it is not S)
        address dAddr = delegatedAddress[curEpoch + 1][staker];
        if (dAddr != staker) {
            initDataIfNeeded(dAddr, curEpoch);
            delegatedStake[curEpoch + 1][dAddr] = delegatedStake[curEpoch + 1][dAddr].add(amount);
            latestDelegatedStake[dAddr] = latestDelegatedStake[dAddr].add(amount);
        }

        emit Deposited(curEpoch, staker, amount);
    }

    event Withdraw(uint curEpoch, address staker, uint amount);

    /**
    * @dev call to withdraw KNC from staking, it could affect reward when calling DAO handleWithdrawal
    * @param amount amount of KNC to withdraw
    */
    function withdraw(uint amount) public nonReentrant {
        require(amount > 0, "withdraw: amount is 0");

        uint curEpoch = getCurrentEpochNumber();
        address staker = msg.sender;

        require(latestStake[staker] >= amount, "withdraw: latest amount staked < withdrawal amount");

        initDataIfNeeded(staker, curEpoch);
        // by right at here stake[curEpoch + 1][staker] should be equal latestStake[staker]
        require(stake[curEpoch + 1][staker] >= amount, "withdraw: next epoch staked amt < withdrawal amount");

        stake[curEpoch + 1][staker] = stake[curEpoch + 1][staker].sub(amount);
        latestStake[staker] = latestStake[staker].sub(amount);

        address dAddr = delegatedAddress[curEpoch][staker];
        uint curStake = stake[curEpoch][staker];
        uint lStakeBal = latestStake[staker];
        uint newStake = curStake.min(lStakeBal);
        uint reduceAmount = curStake.sub(newStake); // newStake is always <= curStake

        if (reduceAmount > 0) {
            if (dAddr != staker) {
                initDataIfNeeded(dAddr, curEpoch);
                // S has delegated to dAddr, withdraw will affect his stakes + dAddr's delegated stakes
                delegatedStake[curEpoch][dAddr] -= reduceAmount;
            }
            stake[curEpoch][staker] = newStake;
            // call DAO to reduce reward, if staker has delegated, then pass his delegated address
            if (address(daoContract) != address(0)) {
                require(daoContract.handleWithdrawal(dAddr, reduceAmount), "withdraw: dao returns false for handle withdrawal");
            }
        }
        dAddr = delegatedAddress[curEpoch + 1][staker];
        if (dAddr != staker) {
            initDataIfNeeded(dAddr, curEpoch);
            require(
                delegatedStake[curEpoch + 1][dAddr] >= amount,
                "withdraw: delegated stake is smaller than next epoch stake"
            );
            require(
                latestDelegatedStake[dAddr] >= amount,
                "withdraw: latest delegated stake is smaller than next epoch stake"
            );
            delegatedStake[curEpoch + 1][dAddr] = delegatedStake[curEpoch + 1][dAddr].sub(amount);
            latestDelegatedStake[dAddr] = latestDelegatedStake[dAddr].sub(amount);
        }
        // transfer KNC back to user
        require(kncToken.transfer(staker, amount), "withdraw: can not transfer knc to the sender");
        emit Withdraw(curEpoch, staker, amount);
    }

    /**
    * @dev init data if needed, then return staker's data for current epoch
    * @dev for safe, only allow calling this func from DAO address
    * @param staker - staker's address to init and get data for
    */
    function initAndReturnStakerDataForCurrentEpoch(address staker)
        public
        returns(uint _stake, uint _delegatedStake, address _delegatedAddress)
    {
        require(msg.sender == address(daoContract), "initAndReturnData: sender is not DAO address");

        uint curEpoch = getCurrentEpochNumber();
        initDataIfNeeded(staker, curEpoch);

        _stake = stake[curEpoch][staker];
        _delegatedStake = delegatedStake[curEpoch][staker];
        _delegatedAddress = delegatedAddress[curEpoch][staker];
    }

    /**
    * @dev in DAO contract, if user wants to claim reward for past epoch, we must know the staker's data for that epoch
    * @dev if the data has not been inited, it means user hasn't done any action -> no reward
    */
    function getStakerDataForPastEpoch(address staker, uint epoch)
        public view
        returns(uint _stake, uint _delegatedStake, address _delegatedAddress)
    {
        _stake = stake[epoch][staker];
        _delegatedStake = delegatedStake[epoch][staker];
        _delegatedAddress = delegatedAddress[epoch][staker];
    }

    /**
    * @dev allow to get data up to current epoch + 1
    */
    function getStake(address staker, uint epoch) public view returns(uint) {
        uint curEpoch = getCurrentEpochNumber();
        if (epoch > curEpoch + 1) { return 0; }
        uint i = epoch;
        while (true) {
            if (hasInited[i][staker]) { return stake[i][staker]; }
            if (i == 0) { break; }
            i--;
        }
        return 0;
    }

    /**
    * @dev allow to get data up to current epoch + 1
    */
    function getDelegatedStake(address staker, uint epoch) public view returns(uint) {
        uint curEpoch = getCurrentEpochNumber();
        if (epoch > curEpoch + 1) { return 0; }
        uint i = epoch;
        while (true) {
            if (hasInited[i][staker]) { return delegatedStake[i][staker]; }
            if (i == 0) { break; }
            i--;
        }
        return 0;
    }

    /**
    * @dev allow to get data up to current epoch + 1
    */
    function getDelegatedAddress(address staker, uint epoch) public view returns(address) {
        uint curEpoch = getCurrentEpochNumber();
        if (epoch > curEpoch + 1) { return address(0); }
        uint i = epoch;
        while (true) {
            if (hasInited[i][staker]) { return delegatedAddress[i][staker]; }
            if (i == 0) { break; }
            i--;
        }
        // not delegated to anyone, default to yourself
        return staker;
    }

    function getLatestDelegatedAddress(address staker) public view returns(address) {
        return latestDelegatedAddress[staker] == address(0) ? staker : latestDelegatedAddress[staker];
    }

    function getLatestDelegatedStake(address staker) public view returns(uint) {
        return latestDelegatedStake[staker];
    }

    function getLatestStakeBalance(address staker) public view returns(uint) {
        return latestStake[staker];
    }

    /**
    * @dev
    * @dev init data if it has not been init
    * @param staker staker's address to init
    * @param epoch should be current epoch
    */
    function initDataIfNeeded(address staker, uint epoch) internal {
        address ldAddress = latestDelegatedAddress[staker];
        if (ldAddress == address(0)) {
            // not delegate to anyone, consider as delegate to yourself
            latestDelegatedAddress[staker] = staker;
            ldAddress = staker;
        }

        uint ldStake = latestDelegatedStake[staker];
        uint lStakeBal = latestStake[staker];

        if (!hasInited[epoch][staker]) {
            hasInited[epoch][staker] = true;
            delegatedAddress[epoch][staker] = ldAddress;
            delegatedStake[epoch][staker] = ldStake;
            stake[epoch][staker] = lStakeBal;
        }

        // whenever users deposit/withdraw/delegate, the current and next epoch data need to be updated
        // as the result, we will also need to init data for staker at the next epoch
        if (!hasInited[epoch + 1][staker]) {
            hasInited[epoch + 1][staker] = true;
            delegatedAddress[epoch + 1][staker] = ldAddress;
            delegatedStake[epoch + 1][staker] = ldStake;
            stake[epoch + 1][staker] = lStakeBal;
        }
    }
}
