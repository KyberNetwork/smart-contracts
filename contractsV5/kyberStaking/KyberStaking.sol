pragma solidity 0.5.11;


import "../IERC20.sol";
import "../ReentrancyGuard.sol";
import "./IKyberStaking.sol";
import "../kyberDAO/IKyberDAO.sol";
import "../EpochUtils.sol";


contract KyberStaking is IKyberStaking, EpochUtils, ReentrancyGuard {

    // amount KNC staked of an address for each epoch
    mapping(uint => mapping(address => uint)) internal stakes;
    // the latest KNC staked of an address
    mapping(address => uint) internal latestStake;

    // amount of KNC that other people has delegated to an address at each epoch
    mapping(uint => mapping(address => uint)) internal delegatedStakes;
    // similar to latest stake balance but for delegated stakes
    mapping(address => uint) internal latestDelegatedStakes;

    // delegated address of an address at each epoch
    mapping(uint => mapping(address => address)) internal delegatedAddress;
    // latest delegated address of an address
    mapping(address => address) internal latestDelegatedAddress;

    // bool for control if we have init data for an epoch + an address
    mapping(uint => mapping(address => bool)) internal hasInited;

    IERC20 public kncToken;
    IKyberDAO public daoContract;
    address public admin;

    constructor(address _kncToken, uint _epochPeriod, uint _startBlock, address _admin) public {
        require(_epochPeriod > 0, "constructor: epoch duration must be positive");
        require(_startBlock >= block.number, "constructor: start block should not be in the past");
        require(_kncToken != address(0), "constructor: KNC address is missing");
        require(_admin != address(0), "constructor: admin address is missing");

        EPOCH_PERIOD = _epochPeriod;
        START_BLOCK = _startBlock;
        kncToken = IERC20(_kncToken);
        admin = _admin;
    }

    event DAOAddressSet(address _daoAddress);

    event AdminRemoved();

    function updateDAOAddressAndRemoveAdmin(address _daoAddress) public {
        require(msg.sender == admin, "updateDAO: sender address is not admin");
        require(_daoAddress != address(0), "updateDAO: DAO address is missing");

        daoContract = IKyberDAO(_daoAddress);
        // verify the same epoch period + start block
        require(daoContract.EPOCH_PERIOD() == EPOCH_PERIOD, "updateDAO: DAO and Staking have different epoch period");
        require(daoContract.START_BLOCK() == START_BLOCK, "updateDAO: DAO and Staking have different start block");

        emit DAOAddressSet(_daoAddress);

        // reset admin
        admin = address(0);
        emit AdminRemoved();
    }

    event Delegated(address staker, address dAddr, bool isDelegated);

    function delegate(address dAddr) public returns(bool) {
        require(dAddr != address(0), "delegate: delegated address should not be 0x0");
        address staker = msg.sender;
        uint curEpoch = getCurrentEpochNumber();

        initDataIfNeeded(staker, curEpoch);

        address curDAddr = delegatedAddress[curEpoch + 1][staker];
        // nothing changes here
        if (dAddr == curDAddr) { return false; }

        uint updatedStake = stakes[curEpoch + 1][staker];

        // reduce delegatedStakes for curDelegatedAddr if needed
        if (curDAddr != staker) {
            initDataIfNeeded(curDAddr, curEpoch);
            // by right we don't need to check if delegatedStakes >= stakes
            require(
                delegatedStakes[curEpoch + 1][curDAddr] >= updatedStake,
                "delegate: delegated stake is smaller than next epoch stake"
            );
            require(
                latestDelegatedStakes[curDAddr] >= updatedStake,
                "delegate: latest delegated stake is smaller than next epoch stake"
            );

            delegatedStakes[curEpoch + 1][curDAddr] = delegatedStakes[curEpoch + 1][curDAddr].sub(updatedStake);
            latestDelegatedStakes[curDAddr] = latestDelegatedStakes[curDAddr].sub(updatedStake);

            emit Delegated(staker, curDAddr, false);
        }

        latestDelegatedAddress[staker] = dAddr;
        delegatedAddress[curEpoch + 1][staker] = dAddr;

        // ignore if S delegated back to himself
        if (dAddr != staker) {
            initDataIfNeeded(dAddr, curEpoch);
            delegatedStakes[curEpoch + 1][dAddr] = delegatedStakes[curEpoch + 1][dAddr].add(updatedStake);
            latestDelegatedStakes[dAddr] = latestDelegatedStakes[dAddr].add(updatedStake);
        }

        emit Delegated(staker, dAddr, true);
    }

    event Deposited(uint curEpoch, address staker, uint amount);

    function deposit(uint amount) public {
        require(amount > 0, "deposit: amount to deposit should be positive");
        // compute epoch number
        uint curEpoch = getCurrentEpochNumber();
        address staker = msg.sender;

        // collect KNC token from sender
        require(kncToken.transferFrom(staker, address(this), amount), "deposit: can not get token");

        initDataIfNeeded(staker, curEpoch);

        stakes[curEpoch + 1][staker] = stakes[curEpoch + 1][staker].add(amount);
        latestStake[staker] = latestStake[staker].add(amount);

        // increase delegated stakes for address that S has delegated to (if it is not S)
        address dAddr = delegatedAddress[curEpoch + 1][staker];
        if (dAddr != staker) {
            initDataIfNeeded(dAddr, curEpoch);
            delegatedStakes[curEpoch + 1][dAddr] = delegatedStakes[curEpoch + 1][dAddr].add(amount);
            latestDelegatedStakes[dAddr] = latestDelegatedStakes[dAddr].add(amount);
        }

        emit Deposited(curEpoch, staker, amount);
    }

    event Withdrew(uint curEpoch, address staker, uint amount);

    function withdraw(uint amount) public nonReentrant {
        require(amount > 0, "withdraw: amount to withdraw should be positive");

        uint curEpoch = getCurrentEpochNumber();
        address staker = msg.sender;

        require(latestStake[staker] >= amount, "withdraw: latest amount staked < withdrawal amount");

        initDataIfNeeded(staker, curEpoch);
        // by right at here stakes[curEpoch + 1][staker] should be equal latestStake[staker]
        require(stakes[curEpoch + 1][staker] >= amount, "withdraw: next epoch staked amt < withdrawal amount");

        stakes[curEpoch + 1][staker] = stakes[curEpoch + 1][staker].sub(amount);
        latestStake[staker] = latestStake[staker].sub(amount);

        address dAddr = delegatedAddress[curEpoch][staker];
        uint curStakes = stakes[curEpoch][staker];
        uint lStakeBal = latestStake[staker];
        uint newStakes = curStakes.min(lStakeBal);
        uint penaltyAmount = curStakes.sub(newStakes); // newStakes is always <= curStakes

        if (penaltyAmount > 0) {
            if (dAddr != staker) {
                initDataIfNeeded(dAddr, curEpoch);
                // S has delegated to dAddr, withdraw will affect his stakes + dAddr's delegated stakes
                delegatedStakes[curEpoch][dAddr] -= penaltyAmount;
            }
            stakes[curEpoch][staker] = newStakes;
            // call DAO to reduce reward, if staker has delegated, then pass his delegated address
            if (address(daoContract) != address(0)) {
                daoContract.handleWithdrawal(dAddr, penaltyAmount);
            }
        }
        dAddr = delegatedAddress[curEpoch + 1][staker];
        if (dAddr != staker) {
            initDataIfNeeded(dAddr, curEpoch);
            require(
                delegatedStakes[curEpoch + 1][dAddr] >= amount,
                "withdraw: delegated stake is smaller than next epoch stake"
            );
            require(
                latestDelegatedStakes[dAddr] >= amount,
                "withdraw: latest delegated stake is smaller than next epoch stake"
            );
            delegatedStakes[curEpoch + 1][dAddr] = delegatedStakes[curEpoch + 1][dAddr].sub(amount);
            latestDelegatedStakes[dAddr] = latestDelegatedStakes[dAddr].sub(amount);
        }
        // transfer KNC back to user
        require(kncToken.transfer(staker, amount), "withdraw: can not transfer knc to the sender");
        emit Withdrew(curEpoch, staker, amount);
    }

    // init data if needed, then true staker's data for current epoch
    // for safe, only allow calling this func from DAO address
    // Note: should only call when staker voted
    function initAndReturnStakerDataForCurrentEpoch(address staker)
        public
        returns(uint _stake, uint _delegatedStake, address _delegatedAddress)
    {
        require(msg.sender == address(daoContract), "initAndReturnData: sender is not DAO address");

        uint curEpoch = getCurrentEpochNumber();
        initDataIfNeeded(staker, curEpoch);

        _stake = stakes[curEpoch][staker];
        _delegatedStake = delegatedStakes[curEpoch][staker];
        _delegatedAddress = delegatedAddress[curEpoch][staker];
    }

    // in DAO contract, if user wants to claim reward for past epoch, we must know the staker's data for that epoch
    // if the data has not been inited, it means user hasn't done any action -> no reward
    function getStakerDataForPastEpoch(address staker, uint epoch)
        public view
        returns(uint _stake, uint _delegatedStake, address _delegatedAddress)
    {
        _stake = stakes[epoch][staker];
        _delegatedStake = delegatedStakes[epoch][staker];
        _delegatedAddress = delegatedAddress[epoch][staker];
    }

    // allow to get data up to current epoch + 1
    function getStakes(address staker, uint epoch) public view returns(uint) {
        uint curEpoch = getCurrentEpochNumber();
        if (epoch > curEpoch + 1) { return 0; }
        uint i = epoch;
        while (true) {
            if (hasInited[i][staker]) { return stakes[i][staker]; }
            if (i == 0) { break; }
            i--;
        }
        return 0;
    }

    // allow to get data up to current epoch + 1
    function getDelegatedStakes(address staker, uint epoch) public view returns(uint) {
        uint curEpoch = getCurrentEpochNumber();
        if (epoch > curEpoch + 1) { return 0; }
        uint i = epoch;
        while (true) {
            if (hasInited[i][staker]) { return delegatedStakes[i][staker]; }
            if (i == 0) { break; }
            i--;
        }
        return 0;
    }

    // allow to get data up to current epoch + 1
    function getDelegatedAddress(address staker, uint epoch) public view returns(address) {
        uint curEpoch = getCurrentEpochNumber();
        if (epoch > curEpoch + 1) { return address(0); }
        uint i = epoch;
        while (true) {
            if (hasInited[i][staker]) { return delegatedAddress[i][staker]; }
            if (i == 0) { break; }
            i--;
        }
        return address(0);
    }

    function getLatestDelegatedAddress(address staker) public view returns(address) {
        return latestDelegatedAddress[staker] == address(0) ? staker : latestDelegatedAddress[staker];
    }

    function getLatestDelegatedStake(address staker) public view returns(uint) {
        return latestDelegatedStakes[staker];
    }

    function getLatestStakeBalance(address staker) public view returns(uint) {
        return latestStake[staker];
    }

    // init data if it has not been init
    // staker: staker's address to init
    // epoch: current epoch
    function initDataIfNeeded(address staker, uint epoch) internal {
        address ldAddress = latestDelegatedAddress[staker];
        if (ldAddress == address(0)) {
            // not delegate to anyone, consider as delegate to yourself
            latestDelegatedAddress[staker] = staker;
            ldAddress = staker;
        }

        uint ldStake = latestDelegatedStakes[staker];
        uint lStakeBal = latestStake[staker];

        if (!hasInited[epoch][staker]) {
            hasInited[epoch][staker] = true;
            delegatedAddress[epoch][staker] = ldAddress;
            delegatedStakes[epoch][staker] = ldStake;
            stakes[epoch][staker] = lStakeBal;
        }

        // whenever users deposit/withdraw/delegate, the current and next epoch data need to be updated
        // as the result, we will also need to init data for staker at the next epoch
        if (!hasInited[epoch + 1][staker]) {
            hasInited[epoch + 1][staker] = true;
            delegatedAddress[epoch + 1][staker] = ldAddress;
            delegatedStakes[epoch + 1][staker] = ldStake;
            stakes[epoch + 1][staker] = lStakeBal;
        }
    }
}
