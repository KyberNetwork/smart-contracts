pragma solidity 0.4.18;


import "../FeeBurnerResolverInterface.sol";


contract MockFeeBurnerResolver is FeeBurnerResolverInterface {

    address feeBurnerContract;

    function MockFeeBurnerResolver(address feeBurner) public {
        require(feeBurner != address(0));
        feeBurnerContract = feeBurner;
    }

    function getFeeBurnerAddress() public view returns(address) {
        return feeBurnerContract;
    }
}
