pragma solidity 0.4.18;


import "./ERC20Interface.sol";
import "./FeeBurnerInterface.sol";
import "./Withdrawable.sol";
import "./Utils.sol";


interface BurnableToken {
    function transferFrom(address _from, address _to, uint _value) public returns (bool);
    function burnFrom(address _from, uint256 _value) public returns (bool);
}


contract FeeBurner is Withdrawable, FeeBurnerInterface, Utils {

    mapping(address=>uint) public reserveFeesInBps;
    mapping(address=>address) public reserveKNCWallet; //wallet holding knc per reserve. from here burn and send fees.
    mapping(address=>uint) public walletFeesInBps; // wallet that is the source of tx is entitled so some fees.
    mapping(address=>uint) public reserveFeeToBurn;
    mapping(address=>uint) public feePayedPerReserve; // track burned fees and sent wallet fees per reserve.
    mapping(address=>mapping(address=>uint)) public reserveFeeToWallet;
    address public taxWallet;
    uint public taxFeeBps = 0; // burned fees are taxed. % out of burned fees.

    BurnableToken public knc;
    address public kyberNetwork;
    uint public kncPerETHRate = 300;

    function FeeBurner(address _admin, BurnableToken kncToken, address _kyberNetwork) public {
        require(_admin != address(0));
        require(kncToken != address(0));
        require(_kyberNetwork != address(0));
        kyberNetwork = _kyberNetwork;
        admin = _admin;
        knc = kncToken;
    }

    function setReserveData(address reserve, uint feesInBps, address kncWallet) public onlyAdmin {
        require(feesInBps < 100); // make sure it is always < 1%
        require(kncWallet != address(0));
        reserveFeesInBps[reserve] = feesInBps;
        reserveKNCWallet[reserve] = kncWallet;
    }

    function setWalletFees(address wallet, uint feesInBps) public onlyAdmin {
        require(feesInBps < 10000); // under 100%
        walletFeesInBps[wallet] = feesInBps;
    }

    function setTaxInBps(uint _taxFeeBps) public onlyAdmin {
        require(_taxFeeBps < 10000); // under 100%
        taxFeeBps = _taxFeeBps;
    }

    function setTaxWallet(address _taxWallet) public onlyAdmin {
        require(_taxWallet != address(0));
        taxWallet = _taxWallet;
    }

    function setKNCRate(uint rate) public onlyAdmin {
        require(rate <= MAX_RATE);
        kncPerETHRate = rate;
    }

    event AssignFeeToWallet(address reserve, address wallet, uint walletFee);
    event AssignBurnFees(address reserve, uint burnFee);

    function handleFees(uint tradeWeiAmount, address reserve, address wallet) public returns(bool) {
        require(msg.sender == kyberNetwork);
        require(tradeWeiAmount <= MAX_QTY);
        require(kncPerETHRate <= MAX_RATE);

        uint kncAmount = tradeWeiAmount * kncPerETHRate;
        uint fee = kncAmount * reserveFeesInBps[reserve] / 10000;

        uint walletFee = fee * walletFeesInBps[wallet] / 10000;
        require(fee >= walletFee);
        uint feeToBurn = fee - walletFee;

        if (walletFee > 0) {
            reserveFeeToWallet[reserve][wallet] += walletFee;
            AssignFeeToWallet(reserve, wallet, walletFee);
        }

        if (feeToBurn > 0) {
            AssignBurnFees(reserve, feeToBurn);
            reserveFeeToBurn[reserve] += feeToBurn;
        }

        return true;
    }


    // this function is callable by anyone
    event BurnAssignedFees(address indexed reserve, address sender, uint quantity);
    event SendTaxFee(address indexed reserve, address sender, address taxWallet, uint quantity);

    function burnReserveFees(address reserve) public {
        uint burnAmount = reserveFeeToBurn[reserve];
        uint taxToSend = 0;
        require(burnAmount > 2);
        reserveFeeToBurn[reserve] = 1; // leave 1 twei to avoid spikes in gas fee
        if (taxWallet != address(0) && taxFeeBps != 0) {
            taxToSend = (burnAmount - 1) * taxFeeBps / 10000;
            require(burnAmount - 1 > taxToSend);
            burnAmount -= taxToSend;
            if (taxToSend > 0) {
                require (knc.transferFrom(reserveKNCWallet[reserve], taxWallet, taxToSend));
                SendTaxFee(reserve, msg.sender, taxWallet, taxToSend);
            }
        }
        require(knc.burnFrom(reserveKNCWallet[reserve], burnAmount - 1));

        //update reserve "payments" so far
        feePayedPerReserve[reserve] += (taxToSend + burnAmount - 1);

        BurnAssignedFees(reserve, msg.sender, (burnAmount - 1));
    }

    event SendWalletFees(address indexed wallet, address reserve, address sender);

    // this function is callable by anyone
    function sendFeeToWallet(address wallet, address reserve) public {
        uint feeAmount = reserveFeeToWallet[reserve][wallet];
        require(feeAmount > 1);
        reserveFeeToWallet[reserve][wallet] = 1; // leave 1 twei to avoid spikes in gas fee
        require(knc.transferFrom(reserveKNCWallet[reserve], wallet, feeAmount - 1));

        feePayedPerReserve[reserve] += (feeAmount - 1);
        SendWalletFees(wallet, reserve, msg.sender);
    }
}
