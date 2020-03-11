pragma solidity 0.5.11;

import "../../../IERC20.sol";
import "./IBancorNetwork.sol";
import "../../../utils/Utils4.sol";

contract MockBancorNetwork is IBancorNetwork, Utils4 {

    IERC20 public bancorBNT;

    IERC20[] public ethToBntPath;
    IERC20[] public bntToEthPath;

    uint public rateEthToBnt;
    uint public rateBntToETh;

    constructor(IERC20 _bancorBNT, IERC20[] memory _ethToBntPath, IERC20[] memory _bntToEthPath) public {
        bancorBNT = _bancorBNT;
        ethToBntPath = _ethToBntPath;
        bntToEthPath = _bntToEthPath;
    }

    function() external payable { }

    function setExchangeRate(uint _rateEthToBnt, uint _rateBntToEth) public {
        rateEthToBnt = _rateEthToBnt;
        rateBntToETh = _rateBntToEth;
    }

    function setNewEthBntPath(IERC20[] memory _ethToBntPath, IERC20[] memory _bntToEthPath) public {
        ethToBntPath = _ethToBntPath;
        bntToEthPath = _bntToEthPath;
    }

    function getReturnByPath(IERC20[] calldata _path, uint256 _amount) external view returns (uint256, uint256) {
        require(_amount > 0);
        // verify if path is ethToBntPath
        if (_path.length == ethToBntPath.length) {
            bool isPathOk = true;
            for(uint i = 0; i < _path.length; i++) {
                if (_path[i] != ethToBntPath[i]) {
                    isPathOk = false;
                    break;
                }
            }
            if (isPathOk) {
                // rate eth to bnt
                uint destAmount = calcDstQty(_amount, ETH_DECIMALS, getDecimals(bancorBNT), rateEthToBnt);
                if (destAmount > bancorBNT.balanceOf(address(this))) {
                    return (0, 0);
                }
                return (destAmount, 0);
            }
        }
        // verify if path is from bnt to eth
        if (_path.length == bntToEthPath.length) {
            bool isPathOk = true;
            for(uint i = 0; i < _path.length; i++) {
                if (_path[i] != bntToEthPath[i]) {
                    isPathOk = false;
                    break;
                }
            }
            if (isPathOk) {
                // rate btn to eth
                uint destAmount = calcDstQty(_amount, getDecimals(bancorBNT), ETH_DECIMALS, rateBntToETh);
                if (destAmount > address(this).balance) {
                    return (0, 0);
                }
                return (destAmount, 0);
            }
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
        // trade eth to bnt
        require(_path.length == ethToBntPath.length);
        for(uint i = 0; i < _path.length; i++) {
            require(_path[i] == ethToBntPath[i]);
        }
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
        require(_path.length == bntToEthPath.length);
        for(uint i = 0; i < _path.length; i++) {
            require(_path[i] == bntToEthPath[i]);
        }
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
