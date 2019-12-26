pragma solidity 0.5.11;

import "../../../IERC20.sol";
import "./IBancorNetwork.sol";
import "../../../UtilsV5.sol";

contract MockBancorNetwork is IBancorNetwork, Utils {

    IERC20 public bancorETH;
    IERC20 public bancorBNT;

    uint public rateEthToBnt;
    uint public rateBntToETh;

    constructor(address _bancorETH, address _bancorBNT) public {
        bancorETH = IERC20(_bancorETH);
        bancorBNT = IERC20(_bancorBNT);
    }

    function() external payable { }

    function setExchangeRate(uint _rateEthToBnt, uint _rateBntToEth) public {
        rateEthToBnt = _rateEthToBnt;
        rateBntToETh = _rateBntToEth;
    }

    function getReturnByPath(IERC20[] calldata _path, uint256 _amount) external view returns (uint256, uint256) {
        require(_amount > 0);
        if (_path.length != 3) { return (0, 0); }
        if (_path[0] == bancorBNT && _path[1] == bancorBNT && _path[2] == bancorETH) {
            // rate btn to eth
            uint destAmount = calcDstQty(_amount, getDecimals(bancorBNT), ETH_DECIMALS, rateBntToETh);
            if (destAmount > address(this).balance) {
                return (0, 0);
            }
            return (destAmount, 0);
        }
        if (_path[0] == bancorETH && _path[1] == bancorBNT && _path[2] == bancorBNT) {
            // rate eth to bnt
            uint destAmount = calcDstQty(_amount, ETH_DECIMALS, getDecimals(bancorBNT), rateEthToBnt);
            if (destAmount > bancorBNT.balanceOf(address(this))) {
                return (0, 0);
            }
            return (destAmount, 0);
        }
        return (0, 0);
    }

    function convert2(
        IERC20[] calldata _path,
        uint256 _amount,
        uint256 _minReturn,
        address,
        uint256
    ) external payable returns (uint256) {
        require(_path.length == 3);
        // trade eth to bnt
        require(_path[0] == bancorETH && _path[1] == bancorBNT && _path[2] == bancorBNT);
        require(msg.value == _amount && _amount > 0);
        require(rateEthToBnt > 0);
        uint destAmount = calcDstQty(_amount, ETH_DECIMALS, getDecimals(bancorBNT), rateEthToBnt);
        require(destAmount >= _minReturn);
        require(bancorBNT.transfer(msg.sender, destAmount));
        return destAmount;
    }

    // to convert token to ETH
    function claimAndConvert2(
        IERC20[] calldata _path,
        uint256 _amount,
        uint256 _minReturn,
        address,
        uint256
    ) external returns (uint256) {
        require(_path.length == 3);
        // trade eth to bnt
        require(_path[0] == bancorBNT && _path[1] == bancorBNT && _path[2] == bancorETH);
        // collect bnt
        require(_amount > 0);
        require(bancorBNT.transferFrom(msg.sender, address(this), _amount));
        require(rateBntToETh > 0);
        uint destAmount = calcDstQty(_amount, getDecimals(bancorBNT), ETH_DECIMALS, rateBntToETh);
        require(destAmount >= _minReturn);
        require(destAmount <= address(this).balance);
        msg.sender.transfer(destAmount);
        return destAmount;
    }
}
