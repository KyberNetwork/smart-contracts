pragma solidity 0.4.18;


import "./ERC20Interface.sol";


interface ConversionRatesInterface {

    function recordImbalance(
        ERC20 token,
        int buyAmount,
        uint rateUpdateBlock,
        uint currentBlock
    )
        public;

    function getRate(ERC20 token, uint currentBlockNumber, bool buy, uint qty) public view returns(uint);
    function setQtyStepFunction(ERC20 token, int[] xBuy, int[] yBuy, int[] xSell, int[] ySell) public;
    function setImbalanceStepFunction(ERC20 token, int[] xBuy, int[] yBuy, int[] xSell, int[] ySell) public;
    function claimAdmin() public;
    function addOperator(address newOperator) public;
    function transferAdmin(address newAdmin) public;
    function addToken(ERC20 token) public;
    function setTokenControlInfo(
        ERC20 token,
        uint minimalRecordResolution,
        uint maxPerBlockImbalance,
        uint maxTotalImbalance
    ) public;
    function enableTokenTrade(ERC20 token) public;
    function getTokenControlInfo(ERC20 token) public view returns(uint, uint, uint);
}
