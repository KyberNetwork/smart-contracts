pragma solidity 0.5.11;

import "../IERC20.sol";
import "../ReentrancyGuard.sol";
import "./IKyberStaking.sol";
import "../DAO/IKyberDAO.sol";
import "../EpochUtils.sol";

contract StakingContract is IKyberStaking, EpochUtils, ReentrancyGuard {

    // amount KNC staked of an address for each epoch
    mapping(uint => mapping(address => uint)) internal stakes;
    // the latest KNC staked of an address
    mapping(address => uint) internal latestStakeBalance;

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

    IERC20 public KNC_TOKEN;
    IKyberDAO public DAO;
    address public admin;

    constructor(address _kncToken, uint _epochPeriod, uint _startBlock, address _admin) public {
        require(_epochPeriod > 0, "constructor: epoch duration must be positive");
        require(_startBlock >= block.number, "constructor: start block should not be in the past");
        require(_kncToken != address(0), "constructor: KNC address is missing");
        require(_admin != address(0), "constructor: admin address is missing");

        EPOCH_PERIOD = _epochPeriod;
        START_BLOCK = _startBlock;
        KNC_TOKEN = IERC20(_kncToken);
        admin = _admin;
    }

    event DAOAddressSet(address _daoAddress);
    event AdminRemoved();
    function updateDAOAddressAndRemoveAdmin(address _daoAddress) public {
        require(msg.sender == admin, "updateDAOAddressAndRemoveAdmin: sender address is not admin");
        require(_daoAddress != address(0), "updateDAOAddressAndRemoveAdmin: DAO address is missing");

        DAO = IKyberDAO(_daoAddress);
        emit DAOAddressSet(_daoAddress);

        // reset admin
        admin = address(0);
        emit AdminRemoved();
    }

    // init data if it has not been init
    function initDataIfNeeded(address S) internal {
        uint N = getCurrentEpochNumber();

        address latestDelegatedAddr = latestDelegatedAddress[S];
        if (latestDelegatedAddr == address(0)) {
            // not delegate to anyone, consider as delegate to yourself
            latestDelegatedAddress[S] = S;
            latestDelegatedAddr = S;
        }
        uint latestDelegatedStake = latestDelegatedStakes[S];
        uint latestStakeBal = latestStakeBalance[S];

        if (!hasInited[N][S]) {
            hasInited[N][S] = true;
            delegatedAddress[N][S] = latestDelegatedAddr;
            delegatedStakes[N][S] = latestDelegatedStake;
            stakes[N][S] = latestStakeBal;
        }

        if (!hasInited[N + 1][S]) {
            hasInited[N + 1][S] = true;
            delegatedAddress[N + 1][S] = latestDelegatedAddr;
            delegatedStakes[N + 1][S] = latestDelegatedStake;
            stakes[N + 1][S] = latestStakeBal;
        }
    }

    event Delegated(address S, address dAddr, bool isDelegated);
    function delegate(address dAddr) public returns(bool) {
        require(dAddr != address(0), "delegate: delegated address should not be 0x0");
        address S = msg.sender;

        initDataIfNeeded(S);

        uint N = getCurrentEpochNumber();

        address curDelegatedAddr = delegatedAddress[N + 1][S];
        // nothing changes here
        if (dAddr == curDelegatedAddr) { return false; }

        uint updatedStake = stakes[N + 1][S];

        // reduce delegatedStakes for curDelegatedAddr if needed
        if (curDelegatedAddr != S) {
            initDataIfNeeded(curDelegatedAddr);
            // by right we don't need to check if delegatedStakes >= stakes
            require(delegatedStakes[N + 1][curDelegatedAddr] >= updatedStake, "delegate: delegated stake is smaller than next epoch stake");
            require(latestDelegatedStakes[curDelegatedAddr] >= updatedStake, "delegate: latest delegated stake is smaller than next epoch stake");

            delegatedStakes[N + 1][curDelegatedAddr] -= updatedStake;
            latestDelegatedStakes[curDelegatedAddr] -= updatedStake;

            emit Delegated(S, curDelegatedAddr, false);
        }

        latestDelegatedAddress[S] = dAddr;
        delegatedAddress[N + 1][S] = dAddr;

        // ignore if S delegated back to himself
        if (dAddr != S) {
            initDataIfNeeded(dAddr);
            delegatedStakes[N + 1][dAddr] += updatedStake;
            latestDelegatedStakes[dAddr] += updatedStake;
        }

        emit Delegated(S, dAddr, true);
    }

    event Deposited(uint N, address S, uint amount);
    function deposit(uint amount) public {
        require(amount > 0, "deposit: amount to deposit should be positive");
        // compute epoch number
        uint N = getCurrentEpochNumber();
        address S = msg.sender;

        // collect KNC token from sender
        require(KNC_TOKEN.transferFrom(msg.sender, address(this), amount), "deposit: can not get token");

        initDataIfNeeded(S);
        
        stakes[N+1][S] += amount;
        latestStakeBalance[S] += amount;

        // increase delegated stakes for address that S has delegated to (if it is not S)
        address dAddr = delegatedAddress[N + 1][S];
        if (dAddr != S) {
            initDataIfNeeded(dAddr);
            delegatedStakes[N + 1][dAddr] += amount;
            latestDelegatedStakes[dAddr] += amount;
        }
        
        emit Deposited(N, S, amount);
    }

    event Withdrew(uint N, address S, uint amount);
    function withdraw(uint amount) public nonReentrant {
        require(amount > 0, "withdraw: amount to withdraw should be positive");
        // compute epoch number
        uint N = getCurrentEpochNumber();
        address S = msg.sender;

        require(latestStakeBalance[S] >= amount, "withdraw: latest amount staked is less than withdrawal amount");

        initDataIfNeeded(S);

        // actually not necessary, by right at here stakes[N+1][S] should be equal latestStake[S]
        require(stakes[N + 1][S] >= amount, "withdraw: amount staked at next epoch is less than withdrawal amount");

        stakes[N + 1][S] -= amount;
        latestStakeBalance[S] -= amount;

        address dAddr = delegatedAddress[N][S];

        uint curStakes = stakes[N][S];
        uint latestStakeBal = latestStakeBalance[S];
        uint newStakes = curStakes <= latestStakeBal ? curStakes : latestStakeBal;
        uint penaltyAmount = curStakes - newStakes; // newStakes is always <= curStakes

        if (penaltyAmount > 0) {
            if (dAddr != S) {
                initDataIfNeeded(dAddr);
                // S has delegated to dAddr, withdraw will affect his stakes + dAddr's delegated stakes
                delegatedStakes[N][dAddr] -= penaltyAmount;
            }
            stakes[N][S] = newStakes;

            if (address(DAO) != address(0)) {
                // note: DAO needs to know which address to penalise
                // if staker has delegated, address to penalise is delegated address
                DAO.handleWithdrawal(dAddr, penaltyAmount);
            }
        }

        dAddr = delegatedAddress[N + 1][S];
        if (dAddr != S) {
            initDataIfNeeded(dAddr);

            require(delegatedStakes[N + 1][dAddr] >= amount, "withdraw: delegated stake is smaller than next epoch stake");
            require(latestDelegatedStakes[dAddr] >= amount, "withdraw: latest delegated stake is smaller than next epoch stake");

            delegatedStakes[N + 1][dAddr] -= amount;
            latestDelegatedStakes[dAddr] -= amount;
        }

        // transfer KNC back to user
        require(KNC_TOKEN.transfer(S, amount), "withdraw: can not transfer knc to the sender");

        emit Withdrew(N, S, amount);
    }

    // init data if needed, then true staker's data for current epoch
    // for safe, only allow calling this func from DAO address
    // Note: should only call when staker voted
    function initAndReturnStakerDataForCurrentEpoch(address staker)
        public
        returns(uint _stake, uint _delegatedStake, address _delegatedAddress)
    {
        require(msg.sender == address(DAO), "getStakerDataForCurrentEpoch: sender is not DAO address");

        initDataIfNeeded(staker);

        uint curEpoch = getCurrentEpochNumber();
        _stake = stakes[curEpoch][staker];
        _delegatedStake = delegatedStakes[curEpoch][staker];
        _delegatedAddress = delegatedAddress[curEpoch][staker];
    }

    function getStakerDataForPastEpoch(address staker, uint epoch)
        public view
        returns(uint _stake, uint _delegatedStake, address _delegatedAddress)
    {
        _stake = stakes[epoch][staker];
        _delegatedStake = delegatedStakes[epoch][staker];
        _delegatedAddress = delegatedAddress[epoch][staker];
    }

    // allow to get data up to current epoch + 1
    function getStakes(address S, uint N) public view returns(uint) {
        uint curEpoch = getCurrentEpochNumber();
        if (N > curEpoch + 1) { return 0; }
        uint i = N;
        while (true) {
            if (hasInited[i][S]) { return stakes[i][S]; }
            if (i == 0) { break; }
            i--;
        }
        return 0;
    }

    // allow to get data up to current epoch + 1
    function getDelegatedStakes(address S, uint N) public view returns(uint) {
        uint curEpoch = getCurrentEpochNumber();
        if (N > curEpoch + 1) { return 0; }
        uint i = N;
        while (true) {
            if (hasInited[i][S]) { return delegatedStakes[i][S]; }
            if (i == 0) { break; }
            i--;
        }
        return 0;
    }

    // allow to get data up to current epoch + 1
    function getDelegatedAddress(address S, uint N) public view returns(address) {
        uint curEpoch = getCurrentEpochNumber();
        if (N > curEpoch + 1) { return address(0); }
        uint i = N;
        while (true) {
            if (hasInited[i][S]) { return delegatedAddress[i][S]; }
            if (i == 0) { break; }
            i--;
        }
        return address(0);
    }

    function getLatestDelegatedAddress(address S) public view returns(address) {
        return latestDelegatedAddress[S] == address(0) ? S : latestDelegatedAddress[S];
    }

    function getLatestDelegatedStake(address S) public view returns(uint) {
        return latestDelegatedStakes[S];
    }

    function getLatestStakeBalance(address S) public view returns(uint) {
        return latestStakeBalance[S];
    }
}
