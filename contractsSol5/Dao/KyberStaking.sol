pragma solidity 0.5.11;

import "../IERC20.sol";
import "../utils/zeppelin/ReentrancyGuard.sol";
import "./IKyberStaking.sol";
import "../IKyberDAO.sol";
import "./EpochUtils.sol";


/**
 * @notice   This contract is using SafeMath for uint, which is inherited from EpochUtils
 *           Some events are moved to interface, easier for public uses
 */
contract KyberStaking is IKyberStaking, EpochUtils, ReentrancyGuard {
    struct StakerData {
        uint256 stake;
        uint256 delegatedStake;
        address delegatedAddress;
    }

    IERC20 public kncToken;
    IKyberDAO public daoContract;
    address public daoContractSetter;

    // staker data per epoch
    mapping(uint256 => mapping(address => StakerData)) internal stakerPerEpochData;
    // latest data of a staker, including stake, delegated stake, delegated address
    mapping(address => StakerData) internal stakerLatestData;
    // bool for control if we have init data for an epoch + an address
    mapping(uint256 => mapping(address => bool)) internal hasInited;

    event DAOAddressSet(address _daoAddress);
    event DAOContractSetterRemoved();
    // event is fired if something is wrong with withdrawal
    // even though the withdrawal is still successful
    event WithdrawDataUpdateFailed(uint256 curEpoch, address staker, uint256 amount);

    constructor(
        address _kncToken,
        uint256 _epochPeriod,
        uint256 _startTimestamp,
        address _daoContractSetter
    ) public {
        require(_epochPeriod > 0, "ctor: epoch duration must be positive");
        require(_startTimestamp >= now, "ctor: start timestamp should not be in the past");
        require(_kncToken != address(0), "ctor: KNC address is missing");
        require(_daoContractSetter != address(0), "ctor: daoContractSetter address is missing");

        epochPeriodInSeconds = _epochPeriod;
        firstEpochStartTimestamp = _startTimestamp;
        kncToken = IERC20(_kncToken);
        daoContractSetter = _daoContractSetter;
    }

    modifier onlyDAOContractSetter() {
        require(msg.sender == daoContractSetter, "sender is not daoContractSetter");
        _;
    }

    /**
     * @dev update DAO address and set daoSetter to zero address, can only call once
     * @param _daoAddress address of new DAO
     */
    function updateDAOAddressAndRemoveSetter(address _daoAddress) external onlyDAOContractSetter {
        require(_daoAddress != address(0), "updateDAO: DAO address is missing");

        daoContract = IKyberDAO(_daoAddress);
        // verify the same epoch period + start timestamp
        require(
            daoContract.epochPeriodInSeconds() == epochPeriodInSeconds,
            "updateDAO: DAO and Staking have different epoch period"
        );
        require(
            daoContract.firstEpochStartTimestamp() == firstEpochStartTimestamp,
            "updateDAO: DAO and Staking have different start timestamp"
        );

        emit DAOAddressSet(_daoAddress);

        // reset dao contract setter
        daoContractSetter = address(0);
        emit DAOContractSetterRemoved();
    }

    // prettier-ignore
    /**
     * @dev calls to set delegation for msg.sender, will take effect from the next epoch
     * @param dAddr address to delegate to
     */
    function delegate(address dAddr) external {
        require(dAddr != address(0), "delegate: delegated address should not be 0x0");
        address staker = msg.sender;
        uint256 curEpoch = getCurrentEpochNumber();

        initDataIfNeeded(staker, curEpoch);

        address curDAddr = stakerPerEpochData[curEpoch + 1][staker].delegatedAddress;
        // nothing changes here
        if (dAddr == curDAddr) {
            return;
        }

        uint256 updatedStake = stakerPerEpochData[curEpoch + 1][staker].stake;

        // reduce delegatedStake for curDelegatedAddr if needed
        if (curDAddr != staker) {
            initDataIfNeeded(curDAddr, curEpoch);
            // by right, delegatedStake should be greater than updatedStake
            assert(stakerPerEpochData[curEpoch + 1][curDAddr].delegatedStake >= updatedStake);
            assert(stakerLatestData[curDAddr].delegatedStake >= updatedStake);

            stakerPerEpochData[curEpoch + 1][curDAddr].delegatedStake =
                stakerPerEpochData[curEpoch + 1][curDAddr].delegatedStake.sub(updatedStake);
            stakerLatestData[curDAddr].delegatedStake =
                stakerLatestData[curDAddr].delegatedStake.sub(updatedStake);

            emit Delegated(staker, curDAddr, curEpoch, false);
        }

        stakerLatestData[staker].delegatedAddress = dAddr;
        stakerPerEpochData[curEpoch + 1][staker].delegatedAddress = dAddr;

        // ignore if S delegated back to himself
        if (dAddr != staker) {
            initDataIfNeeded(dAddr, curEpoch);
            stakerPerEpochData[curEpoch + 1][dAddr].delegatedStake =
                stakerPerEpochData[curEpoch + 1][dAddr].delegatedStake.add(updatedStake);
            stakerLatestData[dAddr].delegatedStake =
                stakerLatestData[dAddr].delegatedStake.add(updatedStake);
        }

        emit Delegated(staker, dAddr, curEpoch, true);
    }

    // prettier-ignore
    /**
     * @dev call to stake more KNC for msg.sender
     * @param amount amount of KNC to stake
     */
    function deposit(uint256 amount) external {
        require(amount > 0, "deposit: amount to deposit should be positive");
        // compute epoch number
        uint256 curEpoch = getCurrentEpochNumber();
        address staker = msg.sender;

        // collect KNC token from sender
        require(
            kncToken.transferFrom(staker, address(this), amount),
            "deposit: can not get token"
        );

        initDataIfNeeded(staker, curEpoch);

        stakerPerEpochData[curEpoch + 1][staker].stake =
            stakerPerEpochData[curEpoch + 1][staker].stake.add(amount);
        stakerLatestData[staker].stake =
            stakerLatestData[staker].stake.add(amount);

        // increase delegated stake for address that S has delegated to (if it is not S)
        address dAddr = stakerPerEpochData[curEpoch + 1][staker].delegatedAddress;
        if (dAddr != staker) {
            initDataIfNeeded(dAddr, curEpoch);
            stakerPerEpochData[curEpoch + 1][dAddr].delegatedStake =
                stakerPerEpochData[curEpoch + 1][dAddr].delegatedStake.add(amount);
            stakerLatestData[dAddr].delegatedStake =
                stakerLatestData[dAddr].delegatedStake.add(amount);
        }

        emit Deposited(curEpoch, staker, amount);
    }

    /**
     * @dev call to withdraw KNC from staking, it could affect reward when calling DAO handleWithdrawal
     * @param amount amount of KNC to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "withdraw: amount is 0");

        uint256 curEpoch = getCurrentEpochNumber();
        address staker = msg.sender;

        require(
            stakerLatestData[staker].stake >= amount,
            "withdraw: latest amount staked < withdrawal amount"
        );

        (bool success, ) = address(this).call(
            abi.encodeWithSignature(
                "handleWithdrawal(address,uint256,uint256)",
                staker,
                amount,
                curEpoch
            )
        );
        if (!success) {
            // Note: should catch this event to check if something went wrong
            emit WithdrawDataUpdateFailed(curEpoch, staker, amount);
        }

        stakerLatestData[staker].stake = stakerLatestData[staker].stake.sub(amount);

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
        external
        returns (
            uint256 _stake,
            uint256 _delegatedStake,
            address _delegatedAddress
        )
    {
        require(
            msg.sender == address(daoContract),
            "initAndReturnData: sender is not DAO address"
        );

        uint256 curEpoch = getCurrentEpochNumber();
        initDataIfNeeded(staker, curEpoch);

        StakerData memory stakerData = stakerPerEpochData[curEpoch][staker];
        _stake = stakerData.stake;
        _delegatedStake = stakerData.delegatedStake;
        _delegatedAddress = stakerData.delegatedAddress;
    }

    /**
     * @dev  in DAO contract, if user wants to claim reward for past epoch,
     *       we must know the staker's data for that epoch
     *       if the data has not been inited, it means user hasn't done any action -> no reward
     */
    function getStakerDataForPastEpoch(address staker, uint256 epoch)
        external
        view
        returns (
            uint256 _stake,
            uint256 _delegatedStake,
            address _delegatedAddress
        )
    {
        StakerData memory stakerData = stakerPerEpochData[epoch][staker];
        _stake = stakerData.stake;
        _delegatedStake = stakerData.delegatedStake;
        _delegatedAddress = stakerData.delegatedAddress;
    }

    /**
     * @notice don't call on-chain, possibly high gas consumption
     * @dev allow to get data up to current epoch + 1
     */
    function getStake(address staker, uint256 epoch) external view returns (uint256) {
        uint256 curEpoch = getCurrentEpochNumber();
        if (epoch > curEpoch + 1) {
            return 0;
        }
        uint256 i = epoch;
        while (true) {
            if (hasInited[i][staker]) {
                return stakerPerEpochData[i][staker].stake;
            }
            if (i == 0) {
                break;
            }
            i--;
        }
        return 0;
    }

    /**
     * @notice don't call on-chain, possibly high gas consumption
     * @dev allow to get data up to current epoch + 1
     */
    function getDelegatedStake(address staker, uint256 epoch) external view returns (uint256) {
        uint256 curEpoch = getCurrentEpochNumber();
        if (epoch > curEpoch + 1) {
            return 0;
        }
        uint256 i = epoch;
        while (true) {
            if (hasInited[i][staker]) {
                return stakerPerEpochData[i][staker].delegatedStake;
            }
            if (i == 0) {
                break;
            }
            i--;
        }
        return 0;
    }

    /**
     * @notice don't call on-chain, possibly high gas consumption
     * @dev allow to get data up to current epoch + 1
     */
    function getDelegatedAddress(address staker, uint256 epoch) external view returns (address) {
        uint256 curEpoch = getCurrentEpochNumber();
        if (epoch > curEpoch + 1) {
            return address(0);
        }
        uint256 i = epoch;
        while (true) {
            if (hasInited[i][staker]) {
                return stakerPerEpochData[i][staker].delegatedAddress;
            }
            if (i == 0) {
                break;
            }
            i--;
        }
        // not delegated to anyone, default to yourself
        return staker;
    }

    function getLatestDelegatedAddress(address staker) external view returns (address) {
        return
            stakerLatestData[staker].delegatedAddress == address(0)
                ? staker
                : stakerLatestData[staker].delegatedAddress;
    }

    function getLatestDelegatedStake(address staker) external view returns (uint256) {
        return stakerLatestData[staker].delegatedStake;
    }

    function getLatestStakeBalance(address staker) external view returns (uint256) {
        return stakerLatestData[staker].stake;
    }

    // prettier-ignore
    /**
    * @dev  separate logics from withdraw, so staker can withdraw as long as amount <= staker's deposit amount
            calling this function from withdraw function, ignore reverting
    * @param staker staker that is withdrawing
    * @param amount amount to withdraw
    * @param curEpoch current epoch
    */
    function handleWithdrawal(
        address staker,
        uint256 amount,
        uint256 curEpoch
    ) public {
        require(msg.sender == address(this), "only staking contract can call this function");
        initDataIfNeeded(staker, curEpoch);
        // update latest stake will be done after this function
        stakerPerEpochData[curEpoch + 1][staker].stake =
            stakerPerEpochData[curEpoch + 1][staker].stake.sub(amount);

        address dAddr = stakerPerEpochData[curEpoch][staker].delegatedAddress;
        uint256 curStake = stakerPerEpochData[curEpoch][staker].stake;
        uint256 lStakeBal = stakerLatestData[staker].stake.sub(amount);
        uint256 newStake = curStake.min(lStakeBal);
        uint256 reduceAmount = curStake.sub(newStake); // newStake is always <= curStake

        if (reduceAmount > 0) {
            if (dAddr != staker) {
                initDataIfNeeded(dAddr, curEpoch);
                // S has delegated to dAddr, withdraw will affect his stakes + dAddr's delegated stakes
                stakerPerEpochData[curEpoch][dAddr].delegatedStake =
                    stakerPerEpochData[curEpoch][dAddr].delegatedStake.sub(reduceAmount);
            }
            stakerPerEpochData[curEpoch][staker].stake = newStake;
            // call DAO to reduce reward, if staker has delegated, then pass his delegated address
            if (address(daoContract) != address(0)) {
                // don't revert if DAO revert so data will be updated correctly
                (bool success, ) = address(daoContract).call(
                    abi.encodeWithSignature(
                        "handleWithdrawal(address,uint256)",
                        dAddr,
                        reduceAmount
                    )
                );
                if (!success) {
                    emit WithdrawDataUpdateFailed(curEpoch, staker, amount);
                }
            }
        }
        dAddr = stakerPerEpochData[curEpoch + 1][staker].delegatedAddress;
        if (dAddr != staker) {
            initDataIfNeeded(dAddr, curEpoch);
            stakerPerEpochData[curEpoch + 1][dAddr].delegatedStake =
                stakerPerEpochData[curEpoch + 1][dAddr].delegatedStake.sub(amount);
            stakerLatestData[dAddr].delegatedStake =
                stakerLatestData[dAddr].delegatedStake.sub(amount);
        }
    }

    /**
     * @dev init data if it has not been init
     * @param staker staker's address to init
     * @param epoch should be current epoch
     */
    function initDataIfNeeded(address staker, uint256 epoch) internal {
        address ldAddress = stakerLatestData[staker].delegatedAddress;
        if (ldAddress == address(0)) {
            // not delegate to anyone, consider as delegate to yourself
            stakerLatestData[staker].delegatedAddress = staker;
            ldAddress = staker;
        }

        uint256 ldStake = stakerLatestData[staker].delegatedStake;
        uint256 lStakeBal = stakerLatestData[staker].stake;

        if (!hasInited[epoch][staker]) {
            hasInited[epoch][staker] = true;
            StakerData storage stakerData = stakerPerEpochData[epoch][staker];
            stakerData.delegatedAddress = ldAddress;
            stakerData.delegatedStake = ldStake;
            stakerData.stake = lStakeBal;
        }

        // whenever users deposit/withdraw/delegate, the current and next epoch data need to be updated
        // as the result, we will also need to init data for staker at the next epoch
        if (!hasInited[epoch + 1][staker]) {
            hasInited[epoch + 1][staker] = true;
            StakerData storage nextEpochStakerData = stakerPerEpochData[epoch + 1][staker];
            nextEpochStakerData.delegatedAddress = ldAddress;
            nextEpochStakerData.delegatedStake = ldStake;
            nextEpochStakerData.stake = lStakeBal;
        }
    }
}
