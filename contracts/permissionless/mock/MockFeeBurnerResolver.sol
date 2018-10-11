pragma solidity 0.4.18;


import "../FeeBurnerResolver.sol";


contract MockENS is ENS {

    mapping (bytes32 => Resolver) public nodeToResolver;

    function resolver(bytes32 node) public view returns (Resolver) {
        return nodeToResolver[node];
    }

    function setResolver(bytes32 node, Resolver _resolver) public {
        nodeToResolver[node] = _resolver;
    }
}


contract MockResolver {

    mapping (bytes32 => address) public nodeToAddr;

    function addr(bytes32 node) public view returns (address) {
        return(nodeToAddr[node]);
    }

    function setAddress(bytes32 node, address _address) public {
        nodeToAddr[node] = _address;
    }
}


contract MockKyberNetworkENSResolver is KyberNetworkENSResolver {
    ENS public MOCK_ENS_CONTRACT;

    function setENS(ENS addr) public {
        MOCK_ENS_CONTRACT = addr;
    }

    function mockGetKyberNetworkAddress() internal view returns(address) {
        return ENS_CONTRACT.resolver(calcNode()).addr(calcNode());
    }
}

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
