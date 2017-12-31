pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./Withdrawable.sol";


interface BurnableToken {
    function transferFrom(address _from, address _to, uint _value) public returns (bool);
    function burnFrom(address _from, uint256 _value) public returns (bool);
}


interface FeeBurnerInterface {
    function handleFees ( uint tradeWeiAmount, address reserve, address wallet ) public returns(bool);
}


contract FeeBurner is Withdrawable, FeeBurnerInterface {

    mapping(address=>uint) reserveFeesInBps;
    mapping(address=>address) reserveKNCWallet;
    mapping(address=>uint) walletFeesInBps;
    BurnableToken KNC;
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
        require(feesInBps < 10000);
        walletFeesInBps[wallet] = feesInBps;
    }

    function setKyberNetwork(address network) public onlyAdmin {
        kyberNetwork = network;
    }

    function setKNCRate(uint rate) public onlyAdmin {
        KNCPerETHRate = rate;
    }

    event HandleFees(uint burnFee, uint walletFee, address walletAddress);

    function handleFees(uint tradeWeiAmount, address reserve, address wallet) public returns(bool) {
        require(msg.sender == kyberNetwork);

        uint kncAmount = tradeWeiAmount * KNCPerETHRate;
        uint fee = kncAmount * reserveFeesInBps[reserve] / 10000;

        uint walletFee = fee * walletFeesInBps[wallet] / 10000;

        if( walletFee > 0 ) {
            assert(KNC.transferFrom(reserveKNCWallet[reserve],wallet,walletFee));
        }

        uint feeToBurn = fee - walletFee;
        HandleFees(feeToBurn, walletFee, wallet);

        if( feeToBurn > 0 ) {
            assert(KNC.burnFrom(reserveKNCWallet[reserve], feeToBurn));
        }

        return true;
    }
}
