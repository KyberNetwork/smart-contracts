pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./Withdrawable.sol";


interface BurnableToken {
    function transferFrom(address _from, address _to, uint _value) public returns (bool);
    function burnFrom(address _from, uint256 _value) public returns (bool);
}


interface FeeBurnerInterface {
    function handleFees (uint tradeWeiAmount, address reserve, address wallet) public returns(bool);
}


contract FeeBurner is Withdrawable, FeeBurnerInterface {

    mapping(address=>uint) public reserveFeesInBps;
    mapping(address=>address) public reserveKNCWallet;
    mapping(address=>uint) public walletFeesInBps;

    mapping(address=>uint) public reserveFeeToBurn;
    mapping(address=>mapping(address=>uint)) public reserveFeeToWallet;

    BurnableToken public KNC;
    address public kyberNetwork;
    uint public KNCPerETHRate = 300;

    function FeeBurner(address _admin, BurnableToken KNCToken) public {
        admin = _admin;
        KNC = KNCToken;
    }

    function setReserveData(address reserve, uint feesInBps, address kncWallet) public onlyAdmin {
        require(feesInBps < 100); // make sure it is always < 1%
        reserveFeesInBps[reserve] = feesInBps;
        reserveKNCWallet[reserve] = kncWallet;
    }

    function setWalletFees(address wallet, uint feesInBps) public onlyAdmin {
        require(feesInBps < 10000); // under 100%
        walletFeesInBps[wallet] = feesInBps;
    }

    function setKyberNetwork(address network) public onlyAdmin {
        kyberNetwork = network;
    }

    function setKNCRate(uint rate) public onlyAdmin {
        KNCPerETHRate = rate;
    }

    event AssignFeeToWallet(address reserve, address wallet, uint walletFee);
    event BurnFees(address reserve, uint burnFee);

    function handleFees(uint tradeWeiAmount, address reserve, address wallet) public returns(bool) {
        require(msg.sender == kyberNetwork);

        uint kncAmount = tradeWeiAmount * KNCPerETHRate;
        uint fee = kncAmount * reserveFeesInBps[reserve] / 10000;

        uint walletFee = fee * walletFeesInBps[wallet] / 10000;
        require(fee >= walletFee);
        uint feeToBurn = fee - walletFee;

        if (walletFee > 0) {
            reserveFeeToWallet[reserve][wallet] += walletFee;
            AssignFeeToWallet(reserve, wallet, walletFee);
        }

        if (feeToBurn > 0) {
            BurnFees(reserve, feeToBurn);
            reserveFeeToBurn[reserve] += feeToBurn;
        }

        return true;
    }

    // this function is callable by anyone
    event BurnReserveFees(address indexed reserve, address sender);

    function burnReserveFees(address reserve) public {
        uint burnAmount = reserveFeeToBurn[reserve];
        require(burnAmount > 0);
        reserveFeeToBurn[reserve] = 1; // leave 1 twei to avoid spikes in gas fee
        assert(KNC.burnFrom(reserveKNCWallet[reserve], burnAmount - 1));

        BurnReserveFees(reserve, msg.sender);
    }

    event SendFeeToWallet(address indexed wallet, address reserve, address sender);

    // this function is callable by anyone
    function sendFeeToWallet(address wallet, address reserve) public {
        uint feeAmount = reserveFeeToWallet[reserve][wallet];
        require(feeAmount > 0);
        reserveFeeToWallet[reserve][wallet] = 1; // leave 1 twei to avoid spikes in gas fee
        assert(KNC.transferFrom(reserveKNCWallet[reserve], wallet, feeAmount - 1));

        SendFeeToWallet(wallet, reserve, msg.sender);
    }
}
