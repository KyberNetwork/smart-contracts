pragma solidity 0.6.6;

import "../IERC20.sol";
import "../utils/zeppelin/ReentrancyGuard.sol";
import "./IKyberStaking.sol";
import "../IKyberDao.sol";
import "./EpochUtils.sol";


/**
 * @notice   This contract is using SafeMath for uint, which is inherited from EpochUtils
 *           Some events are moved to interface, easier for public uses
 *           Staking contract will be deployed by KyberDao's contract
 */
contract KyberStaking is IKyberStaking, EpochUtils, ReentrancyGuard {
    struct StakerData {
        uint256 stake;
        uint256 delegatedStake;
        address representative;
    }

    IERC20 public immutable kncToken;
    IKyberDao public immutable kyberDao;

    // staker data per epoch, including stake, delegated stake and representative
    mapping(uint256 => mapping(address => StakerData)) internal stakerPerEpochData;
    // latest data of a staker, including stake, delegated stake, representative
    mapping(address => StakerData) internal stakerLatestData;
    // true/false: if data has been initialized at an epoch for a staker
    mapping(uint256 => mapping(address => bool)) internal hasInited;

    // event is fired if something is wrong with withdrawal
    // even though the withdrawal is still successful
    event WithdrawDataUpdateFailed(uint256 curEpoch, address staker, uint256 amount);

    constructor(
        IERC20 _kncToken,
        uint256 _epochPeriod,
        uint256 _startTimestamp,
        IKyberDao _kyberDao
    ) public {
        require(_epochPeriod > 0, "ctor: epoch period is 0");
        require(_startTimestamp >= now, "ctor: start in the past");
        require(_kncToken != IERC20(0), "ctor: kncToken 0");
        require(_kyberDao != IKyberDao(0), "ctor: kyberDao 0");

        epochPeriodInSeconds = _epochPeriod;
        firstEpochStartTimestamp = _startTimestamp;
        kncToken = _kncToken;
        kyberDao = _kyberDao;
    }

    /**
     * @dev calls to set delegation for msg.sender, will take effect from the next epoch
     * @param newRepresentative address to delegate to
     */
    function delegate(address newRepresentative) external override {
        require(newRepresentative != address(0), "delegate: representative 0");
        address staker = msg.sender;
        uint256 curEpoch = getCurrentEpochNumber();

        initDataIfNeeded(staker, curEpoch);

        address curRepresentative = stakerPerEpochData[curEpoch + 1][staker].representative;
        // nothing changes here
        if (newRepresentative == curRepresentative) {
            return;
        }

        uint256 updatedStake = stakerPerEpochData[curEpoch + 1][staker].stake;

        // reduce delegatedStake for curRepresentative if needed
        if (curRepresentative != staker) {
            initDataIfNeeded(curRepresentative, curEpoch);

            stakerPerEpochData[curEpoch + 1][curRepresentative].delegatedStake =
                stakerPerEpochData[curEpoch + 1][curRepresentative].delegatedStake.sub(updatedStake);
            stakerLatestData[curRepresentative].delegatedStake =
                stakerLatestData[curRepresentative].delegatedStake.sub(updatedStake);

            emit Delegated(staker, curRepresentative, curEpoch, false);
        }

        stakerLatestData[staker].representative = newRepresentative;
        stakerPerEpochData[curEpoch + 1][staker].representative = newRepresentative;

        // ignore if staker is delegating back to himself
        if (newRepresentative != staker) {
            initDataIfNeeded(newRepresentative, curEpoch);
            stakerPerEpochData[curEpoch + 1][newRepresentative].delegatedStake =
                stakerPerEpochData[curEpoch + 1][newRepresentative].delegatedStake.add(updatedStake);
            stakerLatestData[newRepresentative].delegatedStake =
                stakerLatestData[newRepresentative].delegatedStake.add(updatedStake);
            emit Delegated(staker, newRepresentative, curEpoch, true);
        }
    }

    /**
     * @dev call to stake more KNC for msg.sender
     * @param amount amount of KNC to stake
     */
    function deposit(uint256 amount) external override {
        require(amount > 0, "deposit: amount is 0");

        uint256 curEpoch = getCurrentEpochNumber();
        address staker = msg.sender;

        // collect KNC token from staker
        require(
            kncToken.transferFrom(staker, address(this), amount),
            "deposit: can not get token"
        );

        initDataIfNeeded(staker, curEpoch);

        stakerPerEpochData[curEpoch + 1][staker].stake =
            stakerPerEpochData[curEpoch + 1][staker].stake.add(amount);
        stakerLatestData[staker].stake =
            stakerLatestData[staker].stake.add(amount);

        // increase delegated stake for address that staker has delegated to (if it is not staker)
        address representative = stakerPerEpochData[curEpoch + 1][staker].representative;
        if (representative != staker) {
            initDataIfNeeded(representative, curEpoch);
            stakerPerEpochData[curEpoch + 1][representative].delegatedStake =
                stakerPerEpochData[curEpoch + 1][representative].delegatedStake.add(amount);
            stakerLatestData[representative].delegatedStake =
                stakerLatestData[representative].delegatedStake.add(amount);
        }

        emit Deposited(curEpoch, staker, amount);
    }

    /**
     * @dev call to withdraw KNC from staking, it could affect reward when calling KyberDao handleWithdrawal
     * @param amount amount of KNC to withdraw
     */
    function withdraw(uint256 amount) external override nonReentrant {
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

        // transfer KNC back to staker
        require(kncToken.transfer(staker, amount), "withdraw: can not transfer knc");
        emit Withdraw(curEpoch, staker, amount);
    }

    /**
     * @dev initialize data if needed, then return staker's data for current epoch
     * @dev for safe, only allow calling this func from KyberDao address
     * @param staker - staker's address to initialize and get data for
     */
    function initAndReturnStakerDataForCurrentEpoch(address staker)
        external
        override
        returns (
            uint256 stake,
            uint256 delegatedStake,
            address representative
        )
    {
        require(
            msg.sender == address(kyberDao),
            "initAndReturnData: only kyberDao"
        );

        uint256 curEpoch = getCurrentEpochNumber();
        initDataIfNeeded(staker, curEpoch);

        StakerData memory stakerData = stakerPerEpochData[curEpoch][staker];
        stake = stakerData.stake;
        delegatedStake = stakerData.delegatedStake;
        representative = stakerData.representative;
    }

    /**
     * @notice return raw data of a staker for an epoch
     *         WARN: should be used only for initialized data
     *          if data has not been initialized, it will return all 0
     *          pool master shouldn't use this function to compute/distribute rewards of pool members
     * @dev  in KyberDao contract, if staker wants to claim reward for past epoch,
     *       we must know the staker's data for that epoch
     *       if the data has not been initialized, it means staker hasn't done any action -> no reward
     */
    function getStakerRawData(address staker, uint256 epoch)
        external
        view
        override
        returns (
            uint256 stake,
            uint256 delegatedStake,
            address representative
        )
    {
        StakerData memory stakerData = stakerPerEpochData[epoch][staker];
        stake = stakerData.stake;
        delegatedStake = stakerData.delegatedStake;
        representative = stakerData.representative;
    }

    /**
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
     * @dev allow to get data up to current epoch + 1
     */
    function getRepresentative(address staker, uint256 epoch) external view returns (address) {
        uint256 curEpoch = getCurrentEpochNumber();
        if (epoch > curEpoch + 1) {
            return address(0);
        }
        uint256 i = epoch;
        while (true) {
            if (hasInited[i][staker]) {
                return stakerPerEpochData[i][staker].representative;
            }
            if (i == 0) {
                break;
            }
            i--;
        }
        // not delegated to anyone, default to yourself
        return staker;
    }

    /**
     * @notice return combine data (stake, delegatedStake, representative) of a staker
     * @dev allow to get staker data up to current epoch + 1
     */
    function getStakerData(address staker, uint256 epoch)
        external view override
        returns (
            uint256 stake,
            uint256 delegatedStake,
            address representative
        )
    {
        stake = 0;
        delegatedStake = 0;
        representative = address(0);

        uint256 curEpoch = getCurrentEpochNumber();
        if (epoch > curEpoch + 1) {
            return (stake, delegatedStake, representative);
        }
        uint256 i = epoch;
        while (true) {
            if (hasInited[i][staker]) {
                stake = stakerPerEpochData[i][staker].stake;
                delegatedStake = stakerPerEpochData[i][staker].delegatedStake;
                representative = stakerPerEpochData[i][staker].representative;
                return (stake, delegatedStake, representative);
            }
            if (i == 0) {
                break;
            }
            i--;
        }
        // not delegated to anyone, default to yourself
        representative = staker;
    }

    function getLatestRepresentative(address staker) external view returns (address) {
        return
            stakerLatestData[staker].representative == address(0)
                ? staker
                : stakerLatestData[staker].representative;
    }

    function getLatestDelegatedStake(address staker) external view returns (uint256) {
        return stakerLatestData[staker].delegatedStake;
    }

    function getLatestStakeBalance(address staker) external view returns (uint256) {
        return stakerLatestData[staker].stake;
    }

    function getLatestStakerData(address staker)
        external view override
        returns (
            uint256 stake,
            uint256 delegatedStake,
            address representative
        )
    {
        stake = stakerLatestData[staker].stake;
        delegatedStake = stakerLatestData[staker].delegatedStake;
        representative = stakerLatestData[staker].representative == address(0)
                ? staker
                : stakerLatestData[staker].representative;
    }

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
    ) external {
        require(msg.sender == address(this), "only staking contract");
        initDataIfNeeded(staker, curEpoch);
        // Note: update latest stake will be done after this function
        // update staker's data for next epoch
        stakerPerEpochData[curEpoch + 1][staker].stake =
            stakerPerEpochData[curEpoch + 1][staker].stake.sub(amount);

        address representative = stakerPerEpochData[curEpoch][staker].representative;
        uint256 curStake = stakerPerEpochData[curEpoch][staker].stake;
        uint256 lStakeBal = stakerLatestData[staker].stake.sub(amount);
        uint256 newStake = curStake.min(lStakeBal);
        uint256 reduceAmount = curStake.sub(newStake); // newStake is always <= curStake

        if (reduceAmount > 0) {
            if (representative != staker) {
                initDataIfNeeded(representative, curEpoch);
                // staker has delegated to representative, withdraw will affect representative's delegated stakes
                stakerPerEpochData[curEpoch][representative].delegatedStake =
                    stakerPerEpochData[curEpoch][representative].delegatedStake.sub(reduceAmount);
            }
            stakerPerEpochData[curEpoch][staker].stake = newStake;
            // call KyberDao to reduce reward, if staker has delegated, then pass his representative
            if (address(kyberDao) != address(0)) {
                // don't revert if KyberDao revert so data will be updated correctly
                (bool success, ) = address(kyberDao).call(
                    abi.encodeWithSignature(
                        "handleWithdrawal(address,uint256)",
                        representative,
                        reduceAmount
                    )
                );
                if (!success) {
                    emit WithdrawDataUpdateFailed(curEpoch, staker, amount);
                }
            }
        }
        representative = stakerPerEpochData[curEpoch + 1][staker].representative;
        if (representative != staker) {
            initDataIfNeeded(representative, curEpoch);
            stakerPerEpochData[curEpoch + 1][representative].delegatedStake =
                stakerPerEpochData[curEpoch + 1][representative].delegatedStake.sub(amount);
            stakerLatestData[representative].delegatedStake =
                stakerLatestData[representative].delegatedStake.sub(amount);
        }
    }

    /**
     * @dev initialize data if it has not been initialized yet
     * @param staker staker's address to initialize
     * @param epoch should be current epoch
     */
    function initDataIfNeeded(address staker, uint256 epoch) internal {
        address representative = stakerLatestData[staker].representative;
        if (representative == address(0)) {
            // not delegate to anyone, consider as delegate to yourself
            stakerLatestData[staker].representative = staker;
            representative = staker;
        }

        uint256 ldStake = stakerLatestData[staker].delegatedStake;
        uint256 lStakeBal = stakerLatestData[staker].stake;

        if (!hasInited[epoch][staker]) {
            hasInited[epoch][staker] = true;
            StakerData storage stakerData = stakerPerEpochData[epoch][staker];
            stakerData.representative = representative;
            stakerData.delegatedStake = ldStake;
            stakerData.stake = lStakeBal;
        }

        // whenever stakers deposit/withdraw/delegate, the current and next epoch data need to be updated
        // as the result, we will also initialize data for staker at the next epoch
        if (!hasInited[epoch + 1][staker]) {
            hasInited[epoch + 1][staker] = true;
            StakerData storage nextEpochStakerData = stakerPerEpochData[epoch + 1][staker];
            nextEpochStakerData.representative = representative;
            nextEpochStakerData.delegatedStake = ldStake;
            nextEpochStakerData.stake = lStakeBal;
        }
    }
}
