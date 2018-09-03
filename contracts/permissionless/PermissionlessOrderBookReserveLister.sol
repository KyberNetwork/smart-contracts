pragma solidity 0.4.18;


import "./OrderBookReserve.sol";
import "../KyberNetwork.sol";


contract PermissionlessOrderBookReserveReserveLister {

    bytes32 public orderBookCodeSha3;

    KyberNetwork public kyberNetworkContract;
    FeeBurnerResolverInterface feeBurnerVerifierContract;

    ERC20 public kncToken;

    function KyberController(KyberNetwork kyber, FeeBurnerResolverInterface verifier, ERC20 knc) public {
        require(kyber != address(0));
        require(verifier != address(0));
        require(knc != address(0));

        kncToken = knc;
        kyberNetworkContract = kyber;
        feeBurnerVerifierContract = verifier;

        FeeBurnerInterface burner = FeeBurnerInterface(kyberNetworkContract.feeBurnerContract());
        KyberReserveInterface reserve =
            new OrderBookReserve(FeeBurnerSimpleIf(burner), kncToken, kncToken, feeBurnerVerifierContract);
        orderBookCodeSha3 = getCodeSha3(reserve);
    }

    /// @dev permission less reserve currently supports one token each.
    /// @dev anyone can call
    function listToken(ERC20 token) public {
        require(getOrderBookContract(token) == address(0));

        if (reserve != address(0)) return;

        FeeBurnerInterface burner = FeeBurnerInterface(kyberNetworkContract.feeBurnerContract());
        KyberReserveInterface reserve =
            new OrderBookReserve(FeeBurnerSimpleIf(burner), kncToken, token, feeBurnerVerifierContract);

        kyberNetworkContract.addReserve(reserve, true, true);

        kyberNetworkContract.listPairForReserve(reserve, token, true, true, true);
    }

    function getOrderBookContract(ERC20 token) public view returns(address) {
        uint counter = 0;
        address reserve = kyberNetworkContract.reservesPerTokenSrc(token, counter);

        while (reserve != address(0)) {
            if (getCodeSha3(reserve) == orderBookCodeSha3) {
                return reserve;
            }

            reserve = kyberNetworkContract.reservesPerTokenDest(token, ++counter);
        }

        return (address(0));
    }

    function getCodeSha3(address codeAt) public view returns(bytes32) {
        uint codeSize;
        assembly {
            codeSize := extcodesize(codeAt)
        }

        bytes memory code = new bytes(codeSize);

        assembly {
            extcodecopy(codeAt, code, 0, codeSize)
        }

        return (keccak256(code));
    }
}
