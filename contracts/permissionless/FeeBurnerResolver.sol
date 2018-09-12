pragma solidity 0.4.18;


import "./FeeBurnerResolverInterface.sol";


interface ENS {
    function resolver(bytes32 node) public view returns (Resolver);
}


interface Resolver {
    function addr(bytes32 node) view public returns (address);
}


contract KyberNetworkIFENSResolver {
    ENS constant ENS_CONTRACT = ENS(0x314159265dD8dbb310642f98f50C066173C1259b);

    function calcNode() internal pure returns(bytes32) {
        string[2] memory parts;
        parts[0] = "KyberNetworkIF";
        parts[1] = "eth";
        bytes32 namehash = 0x0000000000000000000000000000000000000000000000000000000000000000;
        for(uint i = 0; i < parts.length; i++) {
            namehash = keccak256(namehash, keccak256(parts[parts.length - i - 1]));
        }

        return namehash;
    }

    function getKyberNetworkIFAddress() internal view returns(address) {
        return ENS_CONTRACT.resolver(calcNode()).addr(calcNode());
    }

}


interface KyberNetworkIF {
    function feeBurnerContract() public view returns(address);
}


interface KyberNetworkIFProxy {
    function KyberNetworkIFContract() public view returns(KyberNetworkIF);
}


contract FeeBurnerResolver is KyberNetworkIFENSResolver, FeeBurnerResolverInterface {
    function getFeeBurnerAddress() public view returns(address) {
        return KyberNetworkIFProxy(getKyberNetworkIFAddress()).KyberNetworkIFContract().feeBurnerContract();
    }
}
