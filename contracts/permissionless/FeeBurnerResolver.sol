pragma solidity 0.4.18;


import "./FeeBurnerResolverInterface.sol";


interface ENS {
    function resolver(bytes32 node) public view returns (Resolver);
}


interface Resolver {
    function addr(bytes32 node) public view returns (address);
}


contract KyberNetworkENSResolver {
    ENS public constant ENS_CONTRACT = ENS(0x314159265dD8dbb310642f98f50C066173C1259b);

    function calcNode() internal pure returns(bytes32) {
        string[2] memory parts;
        parts[0] = "KyberNetworkIf";
        parts[1] = "eth";
        bytes32 namehash = 0x0000000000000000000000000000000000000000000000000000000000000000;

        for (uint i = 0; i < parts.length; i++) {
            namehash = keccak256(namehash, keccak256(parts[parts.length - i - 1]));
        }

        return namehash;
    }

    function getKyberNetworkAddress() internal view returns(address) {
        return ENS_CONTRACT.resolver(calcNode()).addr(calcNode());
    }

}


///@dev kyber network local interface contract.
interface KyberNetworkIf {
    function feeBurnerContract() public view returns(address);
}


///@dev kyber network proxy local interface contract.
interface KyberNetworkProxyIf {
    function kyberNetworkContract() public view returns(KyberNetworkIf);
}


contract FeeBurnerResolver is KyberNetworkENSResolver, FeeBurnerResolverInterface {
    function getFeeBurnerAddress() public view returns(address) {
        return KyberNetworkProxyIf(getKyberNetworkAddress()).kyberNetworkContract().feeBurnerContract();
    }
}
