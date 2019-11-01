pragma solidity 0.4.18;


import "../ERC20Interface.sol";
import "../ExpectedRateInterface.sol";


/// this mock is used when only simple actions are required. no reserves are involved.
contract NetworkFailingGetRate {

    mapping(bytes32=>uint) public pairRate; //rate in precision units. i.e. if rate is 10**18 its same as 1:1
    uint constant PRECISION = 10 ** 18;
    ERC20 constant internal ETH_TOKEN_ADDRESS = ERC20(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);

    ExpectedRateInterface public expectedRateContract;

    function() public payable {}

    function setExpectedRateContract (ExpectedRateInterface expectedRate) public {
        expectedRateContract = expectedRate;
    }

    function setPairRate(ERC20 src, ERC20 dest, uint rate) public {
        pairRate[keccak256(src, dest)] = rate;
    }

    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty)
        public view
        returns(uint expectedRate, uint slippageRate)
    {
        srcQty;

        return expectedRateContract.getExpectedRate(src, dest, srcQty, true);
    }

    function findBestRate(ERC20 src, ERC20 dest, uint srcAmount) public view returns(uint obsolete, uint rate) {
        srcAmount;

        uint initialGas = msg.gas;
        require(initialGas > 1000000);

        uint noUse;

        while (msg.gas > initialGas - 1000000) {
            noUse += 1;
        }

        rate = pairRate[keccak256(src, dest)];
        return(0, rate);
    }

    function findBestRateOnlyPermission(ERC20 src, ERC20 dest, uint srcAmount) public view
        returns(uint obsolete, uint rate)
    {
        srcAmount;

        uint initialGas = msg.gas;
        require(initialGas > 1000000);

        uint noUse;

        while (msg.gas > initialGas - 1000000) {
            noUse += 1;
        }

        rate = pairRate[keccak256(src, dest)];
        return(0, rate);
    }

    function searchBestRate(ERC20 src, ERC20 dest, uint srcAmount, bool usePermissionLess) public view
        returns(uint obsolete, uint rate)
    {
        srcAmount;
        usePermissionLess;

        rate = pairRate[keccak256(src, dest)];
        return(0, rate);
    }
}
